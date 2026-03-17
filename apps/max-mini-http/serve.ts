#!/usr/bin/env bun
/**
 * Max HTTP Server — serves a single workspace's CLI over HTTP.
 *
 * Runs the full CLI server-side. Clients POST command argv, the server
 * executes via CLI.execute(), and returns the rendered output.
 *
 * This is a temporary bridge until core types support wire serialization,
 * at which point remote nodes will use the RPC transport directly.
 *
 * Usage:
 *   bun run apps/http-server/serve.ts /path/to/project [--port 7433]
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'
import { MaxError, type Sink } from '@max/core'
import { CLI } from '@max/cli/cli'
import type { CliRequest, ExecuteResult } from '@max/cli/types'
// ^ These subpath exports are defined in @max/cli/package.json

// ============================================================================
// Argument parsing
// ============================================================================

const args = process.argv.slice(2)
let projectDir: string | undefined
let port = 7433

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10)
    i++
  } else if (!args[i].startsWith('-')) {
    projectDir = args[i]
  }
}

if (!projectDir) {
  console.error('Usage: bun run serve.ts <project-dir> [--port 7433]')
  process.exit(1)
}

projectDir = path.resolve(projectDir)
const maxDir = path.join(projectDir, '.max')

if (!fs.existsSync(maxDir)) {
  console.error(`No .max directory found at ${maxDir}`)
  console.error('Run "max init" in the project directory first.')
  process.exit(1)
}

// ============================================================================
// Only these commands are allowed on public nodes
// ============================================================================

const ALLOWED_COMMANDS = new Set(['search', 'schema', 'status', 'ls'])

function extractCommand(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-t' || argv[i] === '--target') { i++; continue }
    if (!argv[i].startsWith('-')) return argv[i]
  }
  return undefined
}

// ============================================================================
// Buffer sink — captures CLI output into a string
// ============================================================================

class BufferSink implements Sink {
  broken = false
  private chunks: string[] = []

  write(data: string): void {
    this.chunks.push(data)
  }

  toString(): string {
    return this.chunks.join('')
  }
}

// ============================================================================
// Bootstrap
// ============================================================================

console.log(`Booting workspace from ${projectDir}...`)

const cfg = new GlobalConfig({ cwd: projectDir, mode: 'direct' })
const globalMax = BunPlatform.createGlobalMax()
const cli = new CLI(cfg, { globalMax })

// Start GlobalMax so it reconciles the workspace
await globalMax.start()

// Register this project as a workspace
const workspaceId = await globalMax.createWorkspace(path.basename(projectDir), {
  via: BunPlatform.workspace.deploy.inProcess,
  config: {
    strategy: 'in-process',
    dataDir: maxDir,
  },
})

const workspace = globalMax.workspace(workspaceId)
const installations = await workspace.listInstallations()
console.log(`Found ${installations.length} installation(s): ${installations.map(i => i.name).join(', ')}`)

for (const inst of installations) {
  try {
    await workspace.installation(inst.id).start()
    console.log(`  Started: ${inst.name}`)
  } catch (err) {
    console.warn(`  Failed to start ${inst.name}:`, err)
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

const workspaceName = path.basename(projectDir)

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',

  fetch: async (req) => {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/cli') {
      return handleCli(req)
    }

    return new Response('Not Found', { status: 404 })
  },
})

async function handleCli(req: Request): Promise<Response> {
  let body: { argv: string[]; installation?: string; kind?: string; shell?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.argv)) {
    return Response.json({ error: 'Missing argv array' }, { status: 400 })
  }

  const kind = body.kind ?? 'run'

  // Command allowlist (skip for completions — they need to introspect commands)
  if (kind === 'run') {
    const cmd = extractCommand(body.argv)
    if (!cmd || !ALLOWED_COMMANDS.has(cmd)) {
      return Response.json(
        { error: `Command not allowed: ${cmd ?? '(none)'}. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` },
        { status: 403 },
      )
    }
  }

  // Inject fully-qualified local target from the client's installation name
  let argv = body.argv
  if (body.installation) {
    argv = ['-t', `max://@/${workspaceName}/${body.installation}`, ...argv]
  }

  const sink = new BufferSink()
  const cliReq: CliRequest = {
    kind: kind as 'run' | 'complete',
    argv,
    cwd: projectDir!,
    color: false,
    shell: body.shell,
  }

  try {
    const handle = cli.execute(cliReq, { sink })
    const result: ExecuteResult = await handle.result.catch((err): ExecuteResult => ({
      exitCode: 1,
      stderr: MaxError.isMaxError(err) ? err.prettyPrint({ color: false }) : String(err),
    }))

    return Response.json({
      stdout: sink.toString(),
      stderr: result.stderr ?? null,
      exitCode: result.exitCode,
      completions: result.completions ?? null,
    })
  } catch (err) {
    return Response.json({
      stdout: '',
      stderr: String(err),
      exitCode: 1,
    })
  }
}

console.log(`\nMax HTTP server listening on http://${server.hostname}:${server.port}`)
console.log(`Workspace: ${workspaceName}`)
console.log(`\nTry from a client:`)
if (installations.length > 0) {
  const name = installations[0].name
  console.log(`  max -t max+http://localhost:${server.port}/${workspaceName}/${name} schema`)
  console.log(`  max -t max+http://localhost:${server.port}/${workspaceName}/${name} search <entity>`)
}

// Clean shutdown
const shutdown = async () => {
  console.log('\nShutting down...')
  server.stop()
  await globalMax.stop()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

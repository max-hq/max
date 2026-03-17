#!/usr/bin/env bun
/**
 * Max Explorer — browse all workspaces, installations, schemas, and data.
 *
 * Usage:
 *   bun run apps/max-explorer-demo/serve.ts [--port 3333]
 */

import * as path from 'node:path'
import { BunPlatform } from '@max/platform-bun'
import { type MaxContext, handleListWorkspaces, handleWorkspaceDetail, handleEntityQuery } from './api.ts'

// ============================================================================
// Argument parsing
// ============================================================================

const args = process.argv.slice(2)
let port = 3333

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10)
    i++
  }
}

// ============================================================================
// Bootstrap Max
// ============================================================================

console.log('Booting Max...')

const globalMax = BunPlatform.createGlobalMax()
await globalMax.start()

const workspaces = (await globalMax.listWorkspaces()).map(w => ({ id: w.id, name: w.name }))
console.log(`Found ${workspaces.length} workspace(s): ${workspaces.map(w => w.name).join(', ')}`)

const ctx: MaxContext = { globalMax, workspaces }

// ============================================================================
// Static file serving
// ============================================================================

const UI_DIR = path.join(import.meta.dir, 'ui')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

async function serveStatic(filePath: string): Promise<Response | null> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return null
  const ext = path.extname(filePath)
  return new Response(file, {
    headers: { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' },
  })
}

// ============================================================================
// HTTP Server
// ============================================================================

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',

  fetch: async (req) => {
    const url = new URL(req.url)

    // API routes
    if (url.pathname === '/api/workspaces') {
      return handleListWorkspaces(ctx)
    }

    const wsMatch = url.pathname.match(/^\/api\/workspace\/([^/]+)$/)
    if (wsMatch) {
      try {
        return await handleWorkspaceDetail(ctx, wsMatch[1])
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 404 })
      }
    }

    const entityMatch = url.pathname.match(/^\/api\/workspace\/([^/]+)\/entities\/([^/]+)\/([^/]+)$/)
    if (entityMatch) {
      return handleEntityQuery(ctx, entityMatch[1], entityMatch[2], entityMatch[3], url.searchParams)
    }

    // Static files under /ui/
    if (url.pathname.startsWith('/ui/')) {
      const filePath = path.join(UI_DIR, url.pathname.replace('/ui/', ''))
      const res = await serveStatic(filePath)
      if (res) return res
    }

    // SPA fallback — serve index.html for all other routes
    return new Response(Bun.file(path.join(UI_DIR, 'index.html')), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  },
})

console.log(`\n${'='.repeat(50)}`)
console.log(`  Max Explorer`)
console.log(`  http://localhost:${port}`)
console.log(`  ${workspaces.length} workspace(s)`)
console.log(`${'='.repeat(50)}\n`)

const shutdown = async () => {
  console.log('\nShutting down...')
  server.stop()
  await globalMax.stop()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

import * as path from 'node:path'
import * as fs from 'node:fs'
import { ErrCollectionCommandFailed } from '../errors/errors.js'

export interface CollectionInstallResult {
  name: string
  path: string
  action: 'cloned' | 'updated'
  connectors: string[]
}

/**
 * Manages connector collections - git repositories containing
 * multiple `connector-*` subdirectories, stored under `~/.max/collections/`.
 */
export class CollectionManager {
  readonly collectionsDir: string

  constructor(maxHomeDir: string) {
    this.collectionsDir = path.join(maxHomeDir, 'collections')
  }

  /** Derive a collection name from a git URL (SSH or HTTPS). */
  static collectionName(gitUrl: string): string {
    const cleaned = gitUrl.replace(/\.git$/, '')
    // SSH: git@github.com:org/repo -> split on / -> repo
    // HTTPS: https://github.com/org/repo -> split on / -> repo
    const segments = cleaned.split('/')
    return segments[segments.length - 1] ?? 'unknown'
  }

  /** Install (clone) or update (pull) a collection from a git URL. */
  async install(gitUrl: string): Promise<CollectionInstallResult> {
    const name = CollectionManager.collectionName(gitUrl)
    const targetDir = path.join(this.collectionsDir, name)

    fs.mkdirSync(this.collectionsDir, { recursive: true })

    let action: 'cloned' | 'updated'

    if (fs.existsSync(path.join(targetDir, '.git'))) {
      await this.exec(['git', '-C', targetDir, 'pull'])
      action = 'updated'
    } else {
      await this.exec(['git', 'clone', gitUrl, targetDir])
      action = 'cloned'
    }

    // Install dependencies so connector imports resolve
    await this.exec(['bun', 'install'], targetDir)

    const connectors = this.scanConnectorDirs(targetDir)
    return { name, path: targetDir, action, connectors }
  }

  /** List all installed collection directories. */
  getCollectionPaths(): string[] {
    if (!fs.existsSync(this.collectionsDir)) return []
    const entries = fs.readdirSync(this.collectionsDir, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(this.collectionsDir, e.name))
  }

  private scanConnectorDirs(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('connector-'))
      .map(e => e.name)
  }

  private async exec(cmd: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw ErrCollectionCommandFailed.create({
        command: cmd.join(' '),
        detail: stderr.trim(),
      })
    }
  }
}

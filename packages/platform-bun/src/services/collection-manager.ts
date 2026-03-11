import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { ErrCollectionCommandFailed } from '../errors/errors.js'

export interface CollectionInstallResult {
  name: string
  path: string
  action: 'cloned' | 'updated' | 'linked'
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

  /** Derive a collection name from a git URL or local path. */
  static collectionName(source: string): string {
    const cleaned = source.replace(/\.git$/, '').replace(/\/+$/, '')
    const segments = cleaned.split('/')
    return segments[segments.length - 1] ?? 'unknown'
  }

  /** Install a collection from a git URL or local path. */
  async install(source: string): Promise<CollectionInstallResult> {
    const localPath = this.resolveLocalPath(source)
    return localPath ? this.installLocal(localPath) : this.installGit(source)
  }

  /** Symlink a local collection directory. */
  private async installLocal(resolvedPath: string): Promise<CollectionInstallResult> {
    const name = CollectionManager.collectionName(resolvedPath)
    const targetDir = path.join(this.collectionsDir, name)

    fs.mkdirSync(this.collectionsDir, { recursive: true })

    // Remove existing target (old symlink or previous git clone)
    if (this.isSymlink(targetDir)) {
      fs.unlinkSync(targetDir)
    } else if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true })
    }

    fs.symlinkSync(resolvedPath, targetDir)

    const connectors = this.scanConnectorDirs(targetDir)
    return { name, path: targetDir, action: 'linked', connectors }
  }

  /** Clone or update a collection from a git URL. */
  private async installGit(gitUrl: string): Promise<CollectionInstallResult> {
    const name = CollectionManager.collectionName(gitUrl)
    const targetDir = path.join(this.collectionsDir, name)

    fs.mkdirSync(this.collectionsDir, { recursive: true })

    // If target is a symlink from a previous local install, remove it
    if (this.isSymlink(targetDir)) {
      fs.unlinkSync(targetDir)
    }

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
      .filter(e => e.isDirectory() || e.isSymbolicLink())
      .map(e => path.join(this.collectionsDir, e.name))
  }

  /** Resolve a source string to an absolute local path, or null if it's not a local directory. */
  private resolveLocalPath(source: string): string | null {
    const expanded = source.startsWith('~')
      ? path.join(os.homedir(), source.slice(1))
      : source
    const resolved = path.resolve(expanded)
    try {
      return fs.statSync(resolved).isDirectory() ? resolved : null
    } catch {
      return null
    }
  }

  private isSymlink(p: string): boolean {
    try {
      return fs.lstatSync(p).isSymbolicLink()
    } catch {
      return false
    }
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

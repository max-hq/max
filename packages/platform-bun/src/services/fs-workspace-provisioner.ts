/**
 * FsWorkspaceProvisioner - provisions the on-disk layout for a workspace.
 *
 * Creates .max/, max.json, and ensures .max is in .gitignore.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { WorkspaceProvisioner } from '@max/federation'

export class FsWorkspaceProvisioner implements WorkspaceProvisioner {
  provision(workspaceRoot: string): void {
    // Ensure .max/ data directory exists
    fs.mkdirSync(path.join(workspaceRoot, '.max'), { recursive: true })

    // Ensure max.json exists
    const configPath = path.join(workspaceRoot, 'max.json')
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({}, null, 2))
    }

    // Ensure .max is in .gitignore (credentials live here)
    this.ensureGitignore(workspaceRoot)
  }

  private ensureGitignore(workspaceRoot: string): void {
    const gitignorePath = path.join(workspaceRoot, '.gitignore')
    try {
      const existing = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf-8')
        : ''
      if (existing.split('\n').some(line => line.trim() === '.max')) return
      const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
      fs.appendFileSync(gitignorePath, `${prefix}.max\n`)
    } catch {
      // Best-effort - don't fail workspace creation over gitignore
    }
  }
}

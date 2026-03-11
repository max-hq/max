/**
 * FsInstallationProvisioner - ensures the installation data directory exists.
 */

import * as fs from 'node:fs'
import type { InstallationProvisioner } from '@max/federation'

export class FsInstallationProvisioner implements InstallationProvisioner {
  provision(dataDir: string): void {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
  }
}

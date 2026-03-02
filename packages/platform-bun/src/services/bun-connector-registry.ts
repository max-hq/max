
import {ConnectorModuleAny, ConnectorRegistry, ConnectorRegistryEntry, InMemoryConnectorRegistry} from "@max/connector";
import {ConnectorVersionIdentifier, LifecycleManager} from "@max/core";
import { ErrConnectorNotFound, ErrConnectorNotInstalled } from '@max/federation'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Default connectors directory - resolved relative to this file in the monorepo */
const DEFAULT_CONNECTORS_DIR = path.resolve(import.meta.dir, '../../../../connectors')

/**
 * NaiveBunConnectorRegistry - A limited, project-local connector registry.
 *
 * Accepts a name-to-package mapping and registers lazy loaders that `import()`
 * each package by name via Bun's module resolution.
 *
 * Use `fromConnectorsDir()` to auto-discover connectors from a local directory
 * instead of specifying them manually. This scans for `connector-*` subdirectories,
 * reads each `package.json` for the package name, and wires them up automatically.
 *
 * Limitations:
 * - Only knows about connectors explicitly provided or physically present in the monorepo
 * - Cannot resolve connectors installed from a remote registry
 * - Relies on Bun workspace resolution for imports
 */
export class NaiveBunConnectorRegistry implements ConnectorRegistry {

  #registry = new InMemoryConnectorRegistry()
  #deferredScanDir?: string

  lifecycle = LifecycleManager.on({
    start: () => this.scanForConnectors(),
  })

  constructor(modules: Record<string,string>) {
    Object.entries(modules).forEach(([k,v]) => {
      this.addLocalNamed(k,async () => {
        try{
          return await import(v)
        }catch (e){
          throw ErrConnectorNotInstalled.create({connector: k, location: v})
        }

      })
    })
  }

  addLocal(loader: () => Promise<{ default: ConnectorModuleAny }>): void {
    this.#registry.addLocal(loader)
  }

  addLocalNamed(name: string, loader: () => Promise<{ default: ConnectorModuleAny }>): void {
    this.#registry.addLocalNamed(name, loader)
  }

  list(): ConnectorRegistryEntry[] {
    return this.#registry.list()
  }

  resolve(name: string): Promise<ConnectorModuleAny> {
    return this.#registry.resolve(name)
  }

  /**
   * Auto-discover connectors from a local `connectors/` directory.
   *
   * Defers the filesystem scan to `lifecycle.start()`. Call `start()` (or let
   * a parent lifecycle cascade) before resolving connectors.
   */
  static fromConnectorsDir(connectorsDir: string = DEFAULT_CONNECTORS_DIR): NaiveBunConnectorRegistry {
    const registry = new NaiveBunConnectorRegistry({})
    registry.#deferredScanDir = connectorsDir
    return registry
  }

  private scanForConnectors(): void {
    const connectorsDir = this.#deferredScanDir
    if (!connectorsDir) return

    const entries  = fs.readdirSync(connectorsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('connector-')) continue
      const pkgJsonPath = path.join(connectorsDir, entry.name, 'package.json')
      if (!fs.existsSync(pkgJsonPath)) continue

      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      const name: string | undefined = pkg.name
      if (!name) continue

      this.addLocalNamed(name, async () => {
        try {
          return await import(name)
        } catch (e) {
          throw ErrConnectorNotInstalled.create({ connector: name, location: name })
        }
      })
    }
  }
}

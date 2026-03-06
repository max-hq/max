import {ConnectorModuleAny, ConnectorRegistry, ConnectorRegistryEntry, InMemoryConnectorRegistry, parseConnectorPackage, verifyConnectorExport} from "@max/connector";
import {LifecycleManager, MaxError} from "@max/core";
import {ErrConnectorNotInstalled} from '@max/federation'
import { CollectionManager } from './collection-manager.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

/** Default connectors directory - resolved relative to this file in the monorepo */
const DEFAULT_CONNECTORS_DIR = path.resolve(import.meta.dir, '../../../../connectors')

/**
 * NaiveBunConnectorRegistry - A limited, project-local connector registry.
 *
 * Accepts a name-to-package mapping and registers lazy loaders that `import()`
 * each package by name via Bun's module resolution.
 *
 * Use `fromCollections()` to auto-discover connectors from installed collections
 * under `~/.max/collections/`, or `fromConnectorsDir()` for a single directory.
 *
 * Limitations:
 * - Only knows about connectors explicitly provided or physically present on disk
 * - Cannot resolve connectors installed from a remote registry
 */
export class NaiveBunConnectorRegistry implements ConnectorRegistry {

  #registry = new InMemoryConnectorRegistry()
  #deferredScanDirs: string[] = []

  lifecycle = LifecycleManager.on({
    start: () => this.scanForConnectors(),
  })

  constructor(modules: Record<string,string>) {
    Object.entries(modules).forEach(([k,v]) => {
      this.addLocalNamed(k,async () => {
        try{
          const mod = await import(v)
          return verifyConnectorExport(mod, k, v)
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
   * Auto-discover connectors from installed collections under `~/.max/collections/`.
   *
   * Resolution order:
   * 1. If `MAX_CONNECTORS_DIR` env var is set, scan that single directory (dev override)
   * 2. Else scan all collection directories under `~/.max/collections/`
   * 3. If no collections are installed, fall back to the monorepo `connectors/` dir
   */
  static fromCollections(maxHomeDir?: string): NaiveBunConnectorRegistry {
    const registry = new NaiveBunConnectorRegistry({})

    const envDir = process.env.MAX_CONNECTORS_DIR
    if (envDir) {
      registry.#deferredScanDirs = [envDir]
      return registry
    }

    const home = maxHomeDir ?? path.join(os.homedir(), '.max')
    const manager = new CollectionManager(home)
    const collectionPaths = manager.getCollectionPaths()

    registry.#deferredScanDirs = [DEFAULT_CONNECTORS_DIR, ...collectionPaths]

    return registry
  }

  /**
   * Auto-discover connectors from a single local directory.
   *
   * Defers the filesystem scan to `lifecycle.start()`. Call `start()` (or let
   * a parent lifecycle cascade) before resolving connectors.
   */
  static fromConnectorsDir(connectorsDir: string = DEFAULT_CONNECTORS_DIR): NaiveBunConnectorRegistry {
    const registry = new NaiveBunConnectorRegistry({})
    registry.#deferredScanDirs = [connectorsDir]
    return registry
  }

  private scanForConnectors(): void {
    for (const dir of this.#deferredScanDirs) {
      this.scanDirectory(dir)
    }
  }

  private scanDirectory(connectorsDir: string): void {
    if (!fs.existsSync(connectorsDir)) return

    const entries  = fs.readdirSync(connectorsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('connector-')) continue

      const folderPath = path.join(connectorsDir, entry.name)
      const pkgJsonPath = path.join(folderPath, 'package.json')
      if (!fs.existsSync(pkgJsonPath)) continue

      // At scan time, only extract the name for registration.
      // All validation is deferred to the lazy loader at resolve() time.
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      const name: string | undefined = pkg.name
      if (!name) continue

      this.addLocalNamed(name, async () => {
        const pkgJson = fs.readFileSync(pkgJsonPath, 'utf-8')
        const { entryFile } = parseConnectorPackage(pkgJson, folderPath)
        const importPath = path.resolve(folderPath, entryFile)

        let mod: unknown
        try {
          mod = await import(importPath)
        } catch (e) {
          throw ErrConnectorNotInstalled.create({ connector: name, location: importPath }, undefined, MaxError.wrap(e))
        }
        return verifyConnectorExport(mod, name, importPath)
      })
    }
  }
}

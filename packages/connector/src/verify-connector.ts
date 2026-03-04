/**
 * Verify Connector - basic structural checks for connector packages.
 *
 * Two levels of verification:
 * 1. Package metadata: parse and validate a package.json string for required fields.
 * 2. Module export: verify an imported module has the expected ConnectorModule shape.
 *
 * All I/O (reading files, importing modules) is the caller's responsibility.
 */

import type { ConnectorModuleAny } from './connector-module.js'
import { ErrConnectorPackageInvalid, ErrConnectorModuleInvalid } from './errors.js'

// ============================================================================
// Package Metadata Parsing
// ============================================================================

export interface ConnectorPackageMeta {
  /** The package name from package.json */
  name: string
  /** The relative entry file path (e.g. "./src/index.ts") */
  entryFile: string
}

/**
 * Parse a connector's package.json content and extract verified metadata.
 * Throws if the package.json is missing required fields.
 *
 * @param packageJsonContent - The raw JSON string of the package.json
 * @param location - A label for error messages (e.g. the folder path)
 */
export function parseConnectorPackage(packageJsonContent: string, location: string): ConnectorPackageMeta {
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(packageJsonContent)
  } catch {
    throw ErrConnectorPackageInvalid.create({
      location,
      reason: 'package.json is not valid JSON',
    })
  }

  const name = pkg.name
  if (typeof name !== 'string' || !name) {
    throw ErrConnectorPackageInvalid.create({
      location,
      reason: 'package.json has no "name" field',
    })
  }

  const exports = pkg.exports as Record<string, unknown> | undefined
  const dotExport = exports?.['.'] as Record<string, unknown> | undefined
  // Handle both subpath exports ({ ".": { "default": "..." } })
  // and flat exports ({ "default": "..." })
  const entryFile = dotExport?.default ?? exports?.default ?? pkg.main
  if (typeof entryFile !== 'string' || !entryFile) {
    throw ErrConnectorPackageInvalid.create({
      location,
      reason: 'package.json has no resolvable entry point (exports["."].default, exports.default, or main)',
    })
  }

  return { name, entryFile }
}

// ============================================================================
// Module Export Verification
// ============================================================================

/**
 * Verify that an imported module has a valid ConnectorModule default export.
 * Returns the typed module on success, throws on failure.
 *
 * @param mod - The raw result of a dynamic import()
 * @param connector - The connector name (for error reporting)
 * @param location - The import path (for error reporting)
 */
export function verifyConnectorExport(
  mod: unknown,
  connector: string,
  location: string,
): { default: ConnectorModuleAny } {
  const m = mod as Record<string, unknown>
  if (!m.default) {
    throw ErrConnectorModuleInvalid.create({
      connector,
      location,
      reason: 'missing default export',
    })
  }
  const d = m.default as Record<string, unknown>
  if (!d.def || typeof d.initialise !== 'function') {
    throw ErrConnectorModuleInvalid.create({
      connector,
      location,
      reason: 'default export must have a `def` and an `initialise` function',
    })
  }
  return mod as { default: ConnectorModuleAny }
}

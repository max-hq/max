/**
 * Env - Platform-provided environment for handler functions.
 *
 * Every handler (loader, source, operation, seeder) receives an Env.
 * The base Env carries the connector's context; specialisations add
 * capabilities appropriate to the handler type.
 *
 * - Env        - base: ctx only (used by operations)
 * - LoaderEnv  - ctx + ops (used by loaders and sources)
 * - SeederEnv  - ctx + engine (used by seeders)
 *
 * The envelope is future-proof: adding framework capabilities (logging,
 * cancellation, rate-limit handles) later just adds fields to Env -
 * no handler signature changes required.
 */

import type { ContextDefAny } from './context-def.js'
import type { OperationExecutor } from './operation-executor.js'
import type { Engine } from './engine.js'

// ============================================================================
// Base Env
// ============================================================================

/**
 * Base environment provided to all handler types.
 * Carries the connector-specific context.
 */
export interface Env<TContext extends ContextDefAny = ContextDefAny> {
  /** Connector-specific context (workspaceId, config, etc.) */
  readonly ctx: TContext
}

// ============================================================================
// LoaderEnv
// ============================================================================

/**
 * Environment for loaders and sources.
 * Adds the operation executor for dispatching API calls.
 */
export interface LoaderEnv<TContext extends ContextDefAny = ContextDefAny> extends Env<TContext> {
  /** Framework-provided operation executor */
  readonly ops: OperationExecutor
}

// ============================================================================
// SeederEnv
// ============================================================================

/**
 * Environment for seeders.
 * Adds the engine for storing root entities during bootstrap.
 */
export interface SeederEnv<TContext extends ContextDefAny = ContextDefAny> extends Env<TContext> {
  /** Engine for loading and storing entities */
  readonly engine: Engine
}

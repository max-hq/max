/**
 * Env - Platform-provided environment for handler functions.
 *
 * Every handler (loader, source, operation, seeder) receives an Env.
 * The base Env carries the connector's context; specialisations add
 * capabilities appropriate to the handler type.
 *
 * - Env            - base: ctx only
 * - OperationEnv   - ctx (used by operations)
 * - LoaderEnv      - ctx + ops (used by loaders and sources)
 * - SeederEnv      - ctx + engine (used by seeders)
 *
 * The envelope is future-proof: adding framework capabilities (logging,
 * cancellation, rate-limit handles) later just adds fields to Env -
 * no handler signature changes required.
 */

import type { ContextDefAny } from './context-def.js'
import type { OperationExecutor } from './operation-executor.js'
import type { Engine } from './engine.js'
import { StaticTypeCompanion } from './companion.js'

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
// OperationEnv
// ============================================================================

/**
 * Environment for operations.
 * Operations are the leaf of the execution tree - they call the raw API,
 * so they receive only the connector context.
 */
export interface OperationEnv<TContext extends ContextDefAny = ContextDefAny> extends Env<TContext> {}

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

// ============================================================================
// Env Companion
// ============================================================================

export const Env = StaticTypeCompanion({
  /** Create an operation environment (ctx only). */
  operation<TContext extends ContextDefAny>(args: { ctx: TContext }): OperationEnv<TContext> {
    return { ctx: args.ctx }
  },

  /** Create a loader/source environment (ctx + ops). */
  loader<TContext extends ContextDefAny>(args: { ctx: TContext; ops: OperationExecutor }): LoaderEnv<TContext> {
    return { ctx: args.ctx, ops: args.ops }
  },

  /** Create a seeder environment (ctx + engine). */
  seeder<TContext extends ContextDefAny>(args: { ctx: TContext; engine: Engine }): SeederEnv<TContext> {
    return { ctx: args.ctx, engine: args.engine }
  },
})

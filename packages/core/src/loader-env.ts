/**
 * LoaderEnv - Typed envelope for loader parameters.
 *
 * The loader signature is a public API. Once connector authors start writing
 * loaders, every added parameter is a breaking change. The envelope is
 * future-proof - adding schema, syncCtx, engine, or other framework
 * capabilities later just adds fields to LoaderEnv.
 *
 * - env.ctx - connector-specific config (workspaceId, etc.)
 * - env.ops - framework-provided operation executor
 */

import type { ContextDefAny, InferContext } from './context-def.js'
import  {BasicOperationExecutor, OperationExecutor } from './operation-executor.js'
import { StaticTypeCompanion } from './companion.js'
import { ErrNoOperationHandler } from './errors/errors.js'

/**
 * LoaderEnv represents the environment provided to loaders.
 * Implementations are provided by execution packages.
 * You're probably looking for StandardLoaderEnv in @max/execution
 */
export interface LoaderEnv<TContext extends ContextDefAny = ContextDefAny> {
  /** Connector-specific context (workspaceId, config, etc.) */
  readonly ctx: TContext;
  /** Framework-provided operation executor */
  readonly ops: OperationExecutor;
}

// ============================================================================
// BasicLoaderEnv
// ============================================================================

/**
 * BasicLoaderEnv - simple executor that calls the operation directly.
 *
 * Use this in tests where loaders don't exercise operations.
 * Similar in spirit to StubbedCredentialStore.
 */
export class BasicLoaderEnv<TContext extends ContextDefAny = ContextDefAny> implements LoaderEnv<TContext> {
  public ops: OperationExecutor
  constructor(public ctx: TContext) {
    this.ctx = ctx;
    this.ops = new BasicOperationExecutor(ctx)
  }
}

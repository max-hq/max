/**
 * BasicLoaderEnv - simple executor that calls the operation directly.
 *
 * Use this in tests where loaders don't exercise operations.
 * Similar in spirit to StubbedCredentialStore.
 */

import type { ContextDefAny } from './context-def.js'
import { BasicOperationExecutor, OperationExecutor } from './operation-executor.js'
import { Env } from './env.js'
import type { LoaderEnv } from './env.js'

export class BasicLoaderEnv<TContext extends ContextDefAny = ContextDefAny> implements LoaderEnv<TContext> {
  public ops: OperationExecutor
  constructor(public ctx: TContext) {
    this.ctx = ctx;
    this.ops = new BasicOperationExecutor(Env.operation({ ctx }))
  }
}

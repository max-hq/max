import { ContextDefAny, LoaderEnv, OperationExecutor } from '@max/core'
import { OperationDispatcher } from './operation-dispatcher.js'
import { DispatchingOperationExecutor } from './dispatching-operation-executor.js'

/**
 * Standard loader environment.
 * Its primary purpose (at time of writing) is to wire execution calls through the operation dispatcher.
 */
export class StandardLoaderEnv<
  TContext extends ContextDefAny = ContextDefAny,
> implements LoaderEnv<TContext> {
  readonly ctx: TContext
  readonly ops: OperationExecutor

  constructor(
    ctx: TContext,
    dispatcher: OperationDispatcher
  ) {
    this.ctx = ctx
    this.ops = new DispatchingOperationExecutor(dispatcher, ctx)
  }
}

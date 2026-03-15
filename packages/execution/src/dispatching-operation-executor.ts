import { OperationInputOf, OperationAny, OperationExecutor, OperationOutputOf } from '@max/core'
import {OperationDispatcher} from "./operation-dispatcher.js";

/**
 * Routes operation execution calls through the provided dispatcher.
 * Bridges the gap between framework dispatch concerns (middleware etc) and connector operation calls.
 * */
export class DispatchingOperationExecutor implements OperationExecutor {
  constructor(
    private dispatcher: OperationDispatcher,
    private ctx: unknown
  ) {}
  execute<TOp extends OperationAny>(op: TOp, input: OperationInputOf<TOp>): Promise<OperationOutputOf<TOp>> {
    return this.dispatcher.dispatch(op, input, this.ctx) as Promise<OperationOutputOf<TOp>>
  }
}

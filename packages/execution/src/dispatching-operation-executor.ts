import { OperationInputOf, OperationAny, OperationExecutor, OperationOutputOf, OperationEnv } from '@max/core'
import {OperationDispatcher} from "./operation-dispatcher.js";

/**
 * Routes operation execution calls through the provided dispatcher.
 * Bridges the gap between framework dispatch concerns (middleware etc) and connector operation calls.
 * */
export class DispatchingOperationExecutor implements OperationExecutor {
  constructor(
    private dispatcher: OperationDispatcher,
    private env: OperationEnv
  ) {}
  execute<TOp extends OperationAny>(op: TOp, input: OperationInputOf<TOp>): Promise<OperationOutputOf<TOp>> {
    return this.dispatcher.dispatch(op, input, this.env) as Promise<OperationOutputOf<TOp>>
  }
}

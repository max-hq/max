/**
 * OperationExecutor - The interface loaders interact with.
 *
 * Lives in @max/core so connectors can type against it.
 * Implementation lives in @max/execution.
 *
 * Type safety comes from the operation token, not the executor's generic.
 * When a loader calls `ops.execute(GetUser, { id })`, TypeScript infers
 * `input: { id: string }` and `return: Promise<User>` from the GetUser definition.
 */

import type { OperationAny, OperationInputOf, OperationOutputOf } from './operation.js'

export interface OperationExecutor {
  execute<TOp extends OperationAny>(
    op: TOp,
    input: OperationInputOf<TOp>,
  ): Promise<OperationOutputOf<TOp>>;
}

/**
 * Binds ctx to operation handlers.
 *
 * A small note about what's happening here:
 * _Something_ needs to take a ctx from an installation and thread it through to operation calls.
 * The implementation is essentially nil / passthrough. But this process deserves a name and a home
 * and a small package of encapsulation.
 * If and when contexts become more constrained than "any", this class will do a better job of earning its keep.
 * Until then, I hope you haven't had to venture too far off the beaten track in finding this.
 */
export class BasicOperationExecutor implements OperationExecutor {
  /**
   * @param ctx the context passed to operation handlers
   */
  constructor(private ctx: any) {
  }
  execute<TOp extends OperationAny>(op: TOp, input: OperationInputOf<TOp>): Promise<OperationOutputOf<TOp>> {
    return op.handle(input,this.ctx)
  }
}

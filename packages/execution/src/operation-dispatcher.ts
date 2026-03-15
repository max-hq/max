/**
 * OperationDispatcher - Framework-facing dispatch strategy for operations.
 *
 * Dispatches operations through a middleware pipeline to the handler.
 *
 * DefaultOperationDispatcher is the standard implementation. Swap it
 * for a ReplayDispatcher, MockDispatcher, etc.
 */

import type { OperationAny, OperationExecutor, OperationInputOf, OperationOutputOf } from '@max/core'
import { countingMiddleware } from './middleware/counting-middleware.js'
import type { OperationCounts } from './middleware/counting-middleware.js'

// ============================================================================
// Middleware
// ============================================================================

export type OperationMiddleware = (
  op: OperationAny,
  input: unknown,
  next: () => Promise<unknown>,
) => Promise<unknown>;

// ============================================================================
// OperationDispatcher Interface
// ============================================================================

export interface OperationDispatcher {
  dispatch(op: OperationAny, input: unknown, ctx: unknown): Promise<unknown>;
}

// ============================================================================
// DefaultOperationDispatcher
// ============================================================================

export class DefaultOperationDispatcher implements OperationDispatcher {
  constructor(private middleware: OperationMiddleware[] = []) {}

  /** Create a dispatcher with the standard middleware stack (counting). */
  static withDefaults(): { dispatcher: DefaultOperationDispatcher; counts: () => OperationCounts } {
    const counting = countingMiddleware()
    return { dispatcher: new DefaultOperationDispatcher([counting.middleware]), counts: counting.counts }
  }

  dispatch(op: OperationAny, input: unknown, ctx: unknown): Promise<unknown> {
    const chain = this.middleware.reduceRight<() => Promise<unknown>>(
      (next, mw) => () => mw(op, input, next),
      () => op.handle(input, ctx),
    );
    return chain();
  }
}

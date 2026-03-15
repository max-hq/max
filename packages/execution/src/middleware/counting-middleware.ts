/**
 * Counting middleware - tracks operation invocations per sync.
 *
 * The only middleware shipped in Phase 1. Future: rate limiting,
 * recording, replay.
 */

import type { OperationMiddleware } from '../operation-dispatcher.js'

// ============================================================================
// Types
// ============================================================================

export interface OperationCounts {
  total: number;
  byOperation: Record<string, number>;
}

// ============================================================================
// Factory
// ============================================================================

export function countingMiddleware(): {
  middleware: OperationMiddleware;
  counts(): OperationCounts;
} {
  const byOperation: Record<string, number> = {};
  let total = 0;

  return {
    middleware: async (op, _input, next) => {
      total++;
      byOperation[op.name] = (byOperation[op.name] ?? 0) + 1;
      return next();
    },
    counts() {
      return { total, byOperation: { ...byOperation } };
    },
  };
}

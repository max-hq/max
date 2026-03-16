/**
 * FlowController - Task-level concurrency gate.
 *
 * Controls how many tasks the SyncExecutor runs in parallel.
 * Operation-level rate limiting is handled separately by middleware.
 */

// ============================================================================
// Types
// ============================================================================

export interface FlowToken {}

// ============================================================================
// FlowController Interface
// ============================================================================

export interface FlowController {
  /** Request permission to execute a task. Returns when a slot is available. */
  acquire(): Promise<FlowToken>;

  /** Release a slot when the task completes. */
  release(token: FlowToken): void;
}

// ============================================================================
// NoOpFlowController
// ============================================================================

/** FlowController that permits all tasks immediately - unlimited concurrency. */
export class NoOpFlowController implements FlowController {
  async acquire(): Promise<FlowToken> {
    return {};
  }

  release(): void {}
}

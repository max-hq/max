/**
 * FlowController - Concurrency/rate gate.
 *
 * Wraps async work with flow control. The implementation decides the
 * strategy (semaphore, token bucket, composite, etc). Consumers just
 * call run() and the controller handles the rest.
 */

export interface FlowController {
  /** Execute fn under flow control. Waits if necessary, then runs fn. */
  run<T>(fn: () => Promise<T>): Promise<T>
}

/**
 * FlowControllerProvider - Registry of named FlowController instances.
 *
 * Manages a flat map of named pools. Consumers declare what they need
 * via a Limit, and the provider decides how to implement it.
 */
export interface FlowControllerProvider {
  /** Get or create a flow controller for the given limit. */
  get(limit: { readonly name: string; readonly concurrent?: number; readonly rate?: number }): FlowController
}

/** FlowController that permits all work immediately - unlimited concurrency. */
export class NoOpFlowController implements FlowController {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

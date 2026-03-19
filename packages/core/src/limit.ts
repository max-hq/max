import { StaticTypeCompanion } from './companion.js'

// ============================================================================
// Limit
// ============================================================================

export interface Limit {
  readonly name: string
  /** Max concurrent operations. */
  readonly concurrent?: number
  /** Max operations per second. */
  readonly rate?: number
}

export const Limit = StaticTypeCompanion({
  /**
   * Create a concurrency-only limit.
   * Operations sharing the same Limit name share the same flow controller.
   */
  concurrent(name: string, max: number): Limit {
    return { name, concurrent: max }
  },

  /**
   * Create a rate-only limit (requests per second).
   */
  rate(name: string, perSecond: number): Limit {
    return { name, rate: perSecond }
  },

  /**
   * Create a composite limit with both concurrency and rate constraints.
   */
  throttle(name: string, opts: { concurrent: number; rate: number }): Limit {
    return { name, concurrent: opts.concurrent, rate: opts.rate }
  },
})

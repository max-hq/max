import { StaticTypeCompanion } from './companion.js'

// ============================================================================
// Strategy
// ============================================================================

export type LimitStrategy = ConcurrencyStrategy
// Future: | RateStrategy | CompositeStrategy

export interface ConcurrencyStrategy {
  readonly kind: 'concurrency'
  readonly max: number
}

// ============================================================================
// Limit
// ============================================================================

export interface Limit {
  readonly name: string
  readonly strategy: LimitStrategy
}

export const Limit = StaticTypeCompanion({
  /**
   * Create a concurrency limit.
   * Operations sharing the same Limit name share the same flow controller.
   */
  concurrent(name: string, max: number): Limit {
    return { name, strategy: { kind: 'concurrency', max } }
  },
})

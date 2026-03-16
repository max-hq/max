import { StaticTypeCompanion } from './companion.js'

export interface Limit {
  readonly name: string
  readonly concurrent: number
}

export const Limit = StaticTypeCompanion({
  /**
   * Create a concurrency limit.
   * Operations sharing the same Limit object share the same semaphore pool.
   */
  concurrent(name: string, max: number): Limit {
    return { name, concurrent: max }
  },
})

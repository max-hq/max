/**
 * @max/plan-parser — Parse sync plan expressions into ASTs.
 *
 * @example
 * ```ts
 * import { parsePlan } from '@max/plan-parser'
 *
 * const plan = parsePlan(`
 *   AcmeWorkspace(#root).collection{teams}
 *   AcmeTeam(*)
 *     .fields{name, key}
 *     .collection{members}
 *   Concurrently {
 *     AcmeUser(*).fields{displayName, email}
 *     AcmeProject(*).fields{name, status}
 *   }
 * `)
 * ```
 */

export type {
  PlanNode,
  PlanEntry,
  PlanStep,
  ConcurrentGroup,
  Selector,
  AllSelector,
  OneSelector,
  FilterSelector,
  Operation,
  FieldsOperation,
  CollectionOperation,
} from './ast.js'

export { parsePlan } from './grammar.js'

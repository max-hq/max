/**
 * AST types for parsed sync plan expressions.
 *
 * The parser produces this tree; downstream consumers walk it
 * to produce a SyncPlan with resolved entity definitions.
 */

import type { FilterNode } from '@max/query-parser'

// ============================================================================
// Selectors — what goes inside the parens
// ============================================================================

/** Select all entities of the type. Syntax: `*` */
export interface AllSelector {
  readonly kind: "all"
}

/** Select one entity by ID. Syntax: `#id` */
export interface OneSelector {
  readonly kind: "one"
  readonly id: string
}

/** Select entities matching a filter. Syntax: filter expression */
export interface FilterSelector {
  readonly kind: "filter"
  readonly filter: FilterNode
}

export type Selector = AllSelector | OneSelector | FilterSelector

// ============================================================================
// Operations — what goes after the dot
// ============================================================================

/** Load scalar/ref fields. Syntax: `.fields{name, email}` or `.fields{*}` */
export interface FieldsOperation {
  readonly kind: "fields"
  readonly fields: "*" | readonly string[]
}

/** Load collection(s). Syntax: `.collection{users}` or `.collection{*}` */
export interface CollectionOperation {
  readonly kind: "collection"
  readonly collections: "*" | readonly string[]
}

export type Operation = FieldsOperation | CollectionOperation

// ============================================================================
// Plan structure
// ============================================================================

/**
 * A step: entity target + selector + one or more sequential operations.
 *
 * Multiple operations are chained with dot syntax:
 * ```
 * AcmeUser(*)
 *   .fields{name, email}
 *   .collection{projects}
 * ```
 */
export interface PlanStep {
  readonly kind: "step"
  readonly entityType: string
  readonly selector: Selector
  readonly operations: readonly Operation[]
}

/** Steps that run in parallel. */
export interface ConcurrentGroup {
  readonly kind: "concurrent"
  readonly steps: readonly PlanStep[]
}

export type PlanEntry = PlanStep | ConcurrentGroup

/** A full sync plan — an ordered list of entries. */
export interface PlanNode {
  readonly entries: readonly PlanEntry[]
}

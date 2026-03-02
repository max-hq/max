/**
 * Arcsecond grammar for sync plan expressions.
 *
 * Grammar:
 *   plan        := ws entry (separator entry)* ws
 *   entry       := concurrent | step
 *   step        := entityType '(' selector ')' chainedOps
 *   chainedOps  := ws '.' operation (ws '.' operation)*
 *   concurrent  := 'Concurrently' ws '{' ws step (separator step)* ws '}'
 *   selector    := '*' | '#' id | filterExpression
 *   operation   := 'fields' '{' argList '}' | 'collection' '{' argList '}'
 *   argList     := '*' | fieldName (',' fieldName)*
 *   separator   := [ \t]* '\n' [ \t\n]*
 */

import {
  str,
  char,
  choice,
  many,
  sequenceOf,
  coroutine,
  recursiveParser,
  optionalWhitespace,
  regex,
  type Parser,
} from 'arcsecond'

import { parseFilter } from '@max/query-parser'
import type {
  PlanNode,
  PlanEntry,
  PlanStep,
  Selector,
  Operation,
} from './ast.js'
import { ErrPlanParse } from './errors.js'

// ============================================================================
// Atoms
// ============================================================================

/** Inline whitespace only (spaces + tabs, no newlines). */
const iws = regex(/^[ \t]*/)

/** Entity type name: PascalCase identifier. */
const entityType = regex(/^[A-Z][a-zA-Z0-9]*/)

/** Field name: identifier starting with letter or underscore. */
const fieldName = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/)

/** Entity ID: permissive alphanumeric with dashes, underscores, dots, colons, @. */
const entityId = regex(/^[a-zA-Z0-9_\-.:@]+/)

// ============================================================================
// Selector content — balanced paren extraction for filter expressions
// ============================================================================

/**
 * Matches balanced content inside parens, respecting:
 * - Nested parentheses (for grouped filter expressions)
 * - Quoted strings (double and single)
 * Stops at the unbalanced closing ')'.
 */
const selectorContent: Parser<string> = recursiveParser(() =>
  many(choice([
    // Quoted strings — opaque to paren balancing
    regex(/^"(?:[^"\\]|\\.)*"/),
    regex(/^'(?:[^'\\]|\\.)*'/),
    // Nested parenthesized group
    sequenceOf([char('('), selectorContent, char(')')]).map(
      ([a, b, c]) => a + b + c,
    ),
    // Any non-special characters
    regex(/^[^()"']+/),
  ])).map(parts => parts.join('')),
)

// ============================================================================
// Selectors
// ============================================================================

/** `*` — select all entities of the type. */
const allSelector: Parser<Selector> = char('*').map(
  (): Selector => ({ kind: 'all' }),
)

/** `#id` — select one entity by ID. */
const oneSelector: Parser<Selector> = sequenceOf([char('#'), entityId]).map(
  ([, id]): Selector => ({ kind: 'one', id }),
)

/**
 * Filter expression — anything else inside the parens.
 * Collects balanced content, then delegates to @max/query-parser.
 */
const filterSelector: Parser<Selector> = selectorContent.map(
  (content): Selector => {
    const filter = parseFilter(content)
    return { kind: 'filter', filter }
  },
)

const selector: Parser<Selector> = choice([
  allSelector,
  oneSelector,
  filterSelector,
])

// ============================================================================
// Operations
// ============================================================================

/** Argument list: `*` or `name, email, ...` */
const wildcardArgs: Parser<'*'> = char('*').map(() => '*' as const)

const namedArgs: Parser<string[]> = sequenceOf([
  fieldName,
  many(sequenceOf([iws, char(','), iws, fieldName]).map(([, , , name]) => name)),
]).map(([first, rest]) => [first, ...rest])

const argList: Parser<'*' | string[]> = choice([wildcardArgs, namedArgs])

/** `.fields{...}` */
const fieldsOp: Parser<Operation> = coroutine(run => {
  run(str('fields'))
  run(iws)
  run(char('{'))
  run(iws)
  const args = run(argList)
  run(iws)
  run(char('}'))
  return { kind: 'fields' as const, fields: args }
})

/** `.collection{...}` */
const collectionOp: Parser<Operation> = coroutine(run => {
  run(str('collection'))
  run(iws)
  run(char('{'))
  run(iws)
  const args = run(argList)
  run(iws)
  run(char('}'))
  return { kind: 'collection' as const, collections: args }
})

const operation: Parser<Operation> = choice([fieldsOp, collectionOp])

// ============================================================================
// Step — target + chained operations
// ============================================================================

/**
 * Any whitespace (including newlines) used between chained operations.
 * The `.` prefix on each operation prevents ambiguity with new entries.
 */
const chainWs = regex(/^[\s]*/)

/**
 * EntityType(selector)
 *   .operation1
 *   .operation2
 */
const step: Parser<PlanStep> = coroutine(run => {
  const entity: string = run(entityType)
  run(char('('))
  run(iws)
  const sel: Selector = run(selector)
  run(iws)
  run(char(')'))

  // First operation (required)
  run(chainWs)
  run(char('.'))
  const firstOp: Operation = run(operation)

  // Additional chained operations (optional)
  const moreOps: Operation[] = run(
    many(
      sequenceOf([chainWs, char('.'), operation]).map(([, , op]) => op),
    ),
  )

  return {
    kind: 'step' as const,
    entityType: entity,
    selector: sel,
    operations: [firstOp, ...moreOps],
  }
})

// ============================================================================
// Concurrent block
// ============================================================================

/** Line separator: at least one newline with optional surrounding whitespace. */
const separator = regex(/^[ \t]*\n[ \t\n]*/)

/** `Concurrently { step ... }` */
const concurrentBlock: Parser<PlanEntry> = coroutine(run => {
  run(str('Concurrently'))
  run(iws)
  run(char('{'))
  run(optionalWhitespace)
  const first: PlanStep = run(step)
  const rest: PlanStep[] = run(
    many(sequenceOf([separator, step]).map(([, s]) => s)),
  )
  run(optionalWhitespace)
  run(char('}'))
  return { kind: 'concurrent' as const, steps: [first, ...rest] }
})

// ============================================================================
// Plan
// ============================================================================

const entry: Parser<PlanEntry> = choice([concurrentBlock, step])

const plan: Parser<PlanNode> = coroutine(run => {
  run(optionalWhitespace)
  const first: PlanEntry = run(entry)
  const rest: PlanEntry[] = run(
    many(sequenceOf([separator, entry]).map(([, e]) => e)),
  )
  run(optionalWhitespace)
  return { entries: [first, ...rest] }
})

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a sync plan string into a PlanNode AST.
 *
 * @throws ErrPlanParse on malformed input
 */
export function parsePlan(input: string): PlanNode {
  const normalised = input.replace(/\r\n/g, '\n').trim()
  if (!normalised) {
    throw ErrPlanParse.create({
      expression: input,
      reason: 'Empty sync plan',
      index: 0,
    })
  }

  const result = plan.run(normalised)

  if (result.isError) {
    throw ErrPlanParse.create({
      expression: input,
      reason: result.error,
      index: result.index,
    })
  }

  if (result.index < normalised.length) {
    throw ErrPlanParse.create({
      expression: input,
      reason: `Unexpected input at position ${result.index}: "${normalised.slice(result.index, result.index + 20)}"`,
      index: result.index,
    })
  }

  return result.result
}

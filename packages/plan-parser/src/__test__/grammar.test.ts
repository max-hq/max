import { describe, test, expect } from 'bun:test'
import { parsePlan } from '../grammar.js'
import type {
  PlanStep,
  ConcurrentGroup,
  FilterSelector,
} from '../ast.js'

// ============================================================================
// Single step — basic operations
// ============================================================================

describe('single step', () => {
  test('forAll with named fields', () => {
    const plan = parsePlan('AcmeUser(*).fields{displayName, email}')
    expect(plan.entries).toHaveLength(1)
    const step = plan.entries[0] as PlanStep
    expect(step.kind).toBe('step')
    expect(step.entityType).toBe('AcmeUser')
    expect(step.selector).toEqual({ kind: 'all' })
    expect(step.operations).toEqual([
      { kind: 'fields', fields: ['displayName', 'email'] },
    ])
  })

  test('forAll with wildcard fields', () => {
    const plan = parsePlan('AcmeUser(*).fields{*}')
    const step = plan.entries[0] as PlanStep
    expect(step.operations).toEqual([{ kind: 'fields', fields: '*' }])
  })

  test('forOne by ID', () => {
    const plan = parsePlan('AcmeWorkspace(#ws1).collection{users}')
    const step = plan.entries[0] as PlanStep
    expect(step.entityType).toBe('AcmeWorkspace')
    expect(step.selector).toEqual({ kind: 'one', id: 'ws1' })
    expect(step.operations).toEqual([
      { kind: 'collection', collections: ['users'] },
    ])
  })

  test('forOne with hyphenated ID', () => {
    const plan = parsePlan('LinearTeam(#team-abc-123).fields{name, key}')
    const step = plan.entries[0] as PlanStep
    expect(step.selector).toEqual({ kind: 'one', id: 'team-abc-123' })
  })

  test('collection with wildcard', () => {
    const plan = parsePlan('AcmeWorkspace(*).collection{*}')
    const step = plan.entries[0] as PlanStep
    expect(step.operations).toEqual([{ kind: 'collection', collections: '*' }])
  })

  test('collection with multiple names', () => {
    const plan = parsePlan('AcmeWorkspace(*).collection{users, projects}')
    const step = plan.entries[0] as PlanStep
    expect(step.operations).toEqual([
      { kind: 'collection', collections: ['users', 'projects'] },
    ])
  })
})

// ============================================================================
// Chained operations
// ============================================================================

describe('chained operations', () => {
  test('two operations on separate lines', () => {
    const plan = parsePlan([
      'AcmeTeam(*)',
      '  .fields{name, key}',
      '  .collection{members}',
    ].join('\n'))

    expect(plan.entries).toHaveLength(1)
    const step = plan.entries[0] as PlanStep
    expect(step.entityType).toBe('AcmeTeam')
    expect(step.selector).toEqual({ kind: 'all' })
    expect(step.operations).toHaveLength(2)
    expect(step.operations[0]).toEqual({ kind: 'fields', fields: ['name', 'key'] })
    expect(step.operations[1]).toEqual({ kind: 'collection', collections: ['members'] })
  })

  test('three chained operations', () => {
    const plan = parsePlan([
      'AcmeUser(*)',
      '  .fields{displayName, email}',
      '  .collection{projects}',
      '  .collection{issues}',
    ].join('\n'))

    const step = plan.entries[0] as PlanStep
    expect(step.operations).toHaveLength(3)
    expect(step.operations[0]).toEqual({ kind: 'fields', fields: ['displayName', 'email'] })
    expect(step.operations[1]).toEqual({ kind: 'collection', collections: ['projects'] })
    expect(step.operations[2]).toEqual({ kind: 'collection', collections: ['issues'] })
  })

  test('chained on same line', () => {
    const plan = parsePlan('AcmeUser(*).fields{name}.collection{projects}')
    const step = plan.entries[0] as PlanStep
    expect(step.operations).toHaveLength(2)
    expect(step.operations[0]).toEqual({ kind: 'fields', fields: ['name'] })
    expect(step.operations[1]).toEqual({ kind: 'collection', collections: ['projects'] })
  })

  test('chained without indentation', () => {
    const plan = parsePlan([
      'AcmeUser(*)',
      '.fields{name}',
      '.collection{projects}',
    ].join('\n'))

    const step = plan.entries[0] as PlanStep
    expect(step.operations).toHaveLength(2)
  })
})

// ============================================================================
// Filter selectors
// ============================================================================

describe('filter selectors', () => {
  test('simple equality filter', () => {
    const plan = parsePlan('AcmeUser(status = active).fields{email}')
    const step = plan.entries[0] as PlanStep
    const sel = step.selector as FilterSelector
    expect(sel.kind).toBe('filter')
    expect(sel.filter).toEqual({
      type: 'comparison',
      field: 'status',
      op: '=',
      value: { raw: 'active', quoted: false },
    })
  })

  test('filter with AND', () => {
    const plan = parsePlan('AcmeUser(status = active AND role = admin).fields{email}')
    const step = plan.entries[0] as PlanStep
    const sel = step.selector as FilterSelector
    expect(sel.filter.type).toBe('logical')
  })

  test('filter with grouped OR', () => {
    const plan = parsePlan(
      'AcmeUser((name = Acme OR name = Beta) AND active = true).fields{*}',
    )
    const step = plan.entries[0] as PlanStep
    const sel = step.selector as FilterSelector
    expect(sel.filter.type).toBe('logical')
    if (sel.filter.type === 'logical') {
      expect(sel.filter.operator).toBe('AND')
      expect(sel.filter.left.type).toBe('logical')
    }
  })

  test('filter with quoted value', () => {
    const plan = parsePlan('AcmeUser(name = "John Doe").fields{email}')
    const step = plan.entries[0] as PlanStep
    const sel = step.selector as FilterSelector
    expect(sel.filter).toEqual({
      type: 'comparison',
      field: 'name',
      op: '=',
      value: { raw: 'John Doe', quoted: true },
    })
  })

  test('filter with comparison operators', () => {
    const plan = parsePlan('AcmeUser(priority >= 5).fields{name}')
    const step = plan.entries[0] as PlanStep
    const sel = step.selector as FilterSelector
    if (sel.filter.type === 'comparison') {
      expect(sel.filter.op).toBe('>=')
    }
  })
})

// ============================================================================
// Sequential plans
// ============================================================================

describe('sequential plans', () => {
  test('multiple sequential steps', () => {
    const plan = parsePlan([
      'AcmeWorkspace(#root).collection{users}',
      'AcmeUser(*).fields{displayName, email}',
      'AcmeProject(*).fields{name, status}',
    ].join('\n'))
    expect(plan.entries).toHaveLength(3)
    expect(plan.entries.every(e => e.kind === 'step')).toBe(true)
  })

  test('sequential steps with chained operations', () => {
    const plan = parsePlan([
      'AcmeWorkspace(#root).collection{teams}',
      'AcmeTeam(*)',
      '  .fields{name, key}',
      '  .collection{members}',
      'AcmeUser(*).fields{displayName}',
    ].join('\n'))

    expect(plan.entries).toHaveLength(3)
    const teamStep = plan.entries[1] as PlanStep
    expect(teamStep.operations).toHaveLength(2)
  })

  test('blank lines between entries', () => {
    const plan = parsePlan([
      'AcmeUser(*).fields{name}',
      '',
      'AcmeTeam(*).fields{key}',
    ].join('\n'))
    expect(plan.entries).toHaveLength(2)
  })
})

// ============================================================================
// Concurrent blocks
// ============================================================================

describe('concurrent blocks', () => {
  test('basic concurrent block', () => {
    const plan = parsePlan([
      'Concurrently {',
      '  AcmeUser(*).fields{displayName, email}',
      '  AcmeProject(*).fields{name, status}',
      '}',
    ].join('\n'))

    expect(plan.entries).toHaveLength(1)
    const group = plan.entries[0] as ConcurrentGroup
    expect(group.kind).toBe('concurrent')
    expect(group.steps).toHaveLength(2)
  })

  test('concurrent with chained operations', () => {
    const plan = parsePlan([
      'Concurrently {',
      '  AcmeUser(*)',
      '    .fields{name}',
      '    .collection{projects}',
      '  AcmeTeam(*).fields{key}',
      '}',
    ].join('\n'))

    const group = plan.entries[0] as ConcurrentGroup
    expect(group.steps).toHaveLength(2)
    expect(group.steps[0].operations).toHaveLength(2)
    expect(group.steps[1].operations).toHaveLength(1)
  })

  test('mixed sequential and concurrent', () => {
    const plan = parsePlan([
      'AcmeWorkspace(#root).collection{teams}',
      'AcmeTeam(*).fields{name, key}',
      'Concurrently {',
      '  AcmeUser(*).fields{displayName, email}',
      '  AcmeProject(*).fields{name, status}',
      '}',
    ].join('\n'))

    expect(plan.entries).toHaveLength(3)
    expect(plan.entries[0].kind).toBe('step')
    expect(plan.entries[1].kind).toBe('step')
    expect(plan.entries[2].kind).toBe('concurrent')
  })
})

// ============================================================================
// Full plan — realistic example
// ============================================================================

describe('full plan', () => {
  test('realistic sync plan', () => {
    const plan = parsePlan([
      'AcmeWorkspace(#root).collection{teams}',
      'AcmeTeam(*)',
      '  .fields{name, key}',
      '  .collection{members}',
      '  .collection{projects}',
      'Concurrently {',
      '  AcmeUser(*).fields{displayName, email}',
      '  AcmeProject(*)',
      '    .fields{name, status}',
      '    .collection{issues}',
      '}',
      'AcmeIssue(*).fields{title, priority}',
    ].join('\n'))

    expect(plan.entries).toHaveLength(4)

    // First: load teams from root workspace
    const ws = plan.entries[0] as PlanStep
    expect(ws.entityType).toBe('AcmeWorkspace')
    expect(ws.selector).toEqual({ kind: 'one', id: 'root' })
    expect(ws.operations).toHaveLength(1)

    // Second: team fields + collections (sequential)
    const team = plan.entries[1] as PlanStep
    expect(team.entityType).toBe('AcmeTeam')
    expect(team.operations).toHaveLength(3)

    // Third: users and projects in parallel
    const concurrent = plan.entries[2] as ConcurrentGroup
    expect(concurrent.steps).toHaveLength(2)
    expect(concurrent.steps[1].operations).toHaveLength(2)

    // Fourth: issue fields
    const issue = plan.entries[3] as PlanStep
    expect(issue.entityType).toBe('AcmeIssue')
  })
})

// ============================================================================
// Whitespace handling
// ============================================================================

describe('whitespace', () => {
  test('tolerates leading/trailing whitespace', () => {
    const plan = parsePlan('  \n  AcmeUser(*).fields{name}  \n  ')
    expect(plan.entries).toHaveLength(1)
  })

  test('tolerates spaces inside braces', () => {
    const plan = parsePlan('AcmeUser( * ).fields{ name , email }')
    const step = plan.entries[0] as PlanStep
    expect(step.selector).toEqual({ kind: 'all' })
    expect(step.operations).toEqual([
      { kind: 'fields', fields: ['name', 'email'] },
    ])
  })

  test('tolerates spaces inside selector', () => {
    const plan = parsePlan('AcmeUser( #ws1 ).fields{name}')
    const step = plan.entries[0] as PlanStep
    expect(step.selector).toEqual({ kind: 'one', id: 'ws1' })
  })
})

// ============================================================================
// Error cases
// ============================================================================

describe('errors', () => {
  test('empty input throws', () => {
    expect(() => parsePlan('')).toThrow()
    expect(() => parsePlan('   ')).toThrow()
  })

  test('lowercase entity type throws', () => {
    expect(() => parsePlan('acmeUser(*).fields{name}')).toThrow()
  })

  test('missing operation throws', () => {
    expect(() => parsePlan('AcmeUser(*)')).toThrow()
  })

  test('missing selector throws', () => {
    expect(() => parsePlan('AcmeUser().fields{name}')).toThrow()
  })

  test('invalid filter in selector throws', () => {
    expect(() => parsePlan('AcmeUser(!!!).fields{name}')).toThrow()
  })
})

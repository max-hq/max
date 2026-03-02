# @max/plan-parser

Parses sync plan expressions into an AST. A sync plan describes what to sync, in what order.

## Syntax

A plan is a sequence of steps. Each step targets an entity type and specifies one or more operations.

```
AcmeWorkspace(#root)
  .fields{*}
  .collection{teams}
  
AcmeUser(*).fields{displayName, email}
```

### Selectors

The parentheses after the entity type select which entities to target:

```
AcmeUser(*)                                   # all entities
AcmeUser(#user-abc-123)                       # one entity by ID
AcmeUser(status = active AND role = admin)    # filter expression
```

Filter expressions use the same syntax as `@max/query-parser` — comparisons joined by AND/OR, with optional grouping:

```
AcmeProject((status = active OR status = review) AND priority >= 3).fields{name}
```

### Operations

Two operations, chained with `.`:

```
.fields{name, email}       # load specific fields
.fields{*}                 # load all fields
.collection{members}       # load specific collection(s)
.collection{*}             # load all collections
```

### Chaining

Multiple operations on the same target are chained on subsequent lines. They execute sequentially, top to bottom:

```
AcmeTeam(*)
  .fields{name, key}
  .collection{members}
  .collection{projects}
```

### Concurrency

Wrap steps in `Concurrently { }` to run them in parallel:

```
Concurrently {
  AcmeUser(*).fields{displayName, email}
  AcmeProject(*).fields{name, status}
}
```

### Full example

```
AcmeWorkspace(#root).collection{teams}

AcmeTeam(*)
  .fields{name, key}
  .collection{members}
  .collection{projects}

Concurrently {
  AcmeUser(*).fields{displayName, email}
  AcmeProject(*)
    .fields{name, status}
    .collection{issues}
}

AcmeIssue(*).fields{title, priority}
```

## Usage

```ts
import { parsePlan } from '@max/plan-parser'

const plan = parsePlan(`
  AcmeUser(*).fields{displayName, email}
  AcmeUser(*).collection{projects}
`)

plan.entries // PlanEntry[] — steps and concurrent groups
```

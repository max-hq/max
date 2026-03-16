---
title: Entities and Schema
sidebar:
  order: 1
---

Your connector's foundation is its data model - the entities, fields, and schema that describe what data you're syncing.

This tutorial builds an Acme connector step by step. By the end of all six parts, you'll have a complete, installable connector. Each part adds one layer.

## Define your entities

An entity represents a data object from your source system - users, projects, tasks. Each entity has typed fields.

```typescript
// connectors/connector-acme/src/entities.ts
import { EntityDef, Field, type ScalarField, type RefField, type CollectionField } from "@max/core";
```

Start with a simple entity:

```typescript
export interface AcmeUser extends EntityDef<{
  displayName: ScalarField<"string">;
  email: ScalarField<"string">;
  role: ScalarField<"string">;
  active: ScalarField<"boolean">;
}> {}

export const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  displayName: Field.string(),
  email: Field.string(),
  role: Field.string(),
  active: Field.boolean(),
});
```

The interface + const pattern gives you one name that works as both a type and a value:

```typescript
// As a type
const ref: Ref<AcmeUser> = ...

// As a value
AcmeUser.ref("u123")
```

:::note
This dual declaration is verbose - an improvement is planned.
:::

### Relational fields

Entities can reference each other. `Field.ref()` creates a one-to-one reference; `Field.collection()` creates a one-to-many relationship:

```typescript
export interface AcmeProject extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  status: ScalarField<"string">;
  owner: RefField<AcmeUser>;
  tasks: CollectionField<AcmeTask>;
}> {}

export const AcmeProject: AcmeProject = EntityDef.create("AcmeProject", {
  name: Field.string(),
  description: Field.string(),
  status: Field.string(),
  owner: Field.ref(AcmeUser),
  tasks: Field.collection(AcmeTask),
});
```

### Field types

| Factory | Type | Use |
|---------|------|-----|
| `Field.string()` | `ScalarField<"string">` | Text values |
| `Field.number()` | `ScalarField<"number">` | Numeric values |
| `Field.boolean()` | `ScalarField<"boolean">` | True/false |
| `Field.date()` | `ScalarField<"date">` | Timestamps |
| `Field.ref(Target)` | `RefField<Target>` | Reference to another entity |
| `Field.refThunk(() => Target)` | `RefField<Target>` | Lazy ref (breaks circular deps) |
| `Field.collection(Target)` | `CollectionField<Target>` | One-to-many relationship |

### Declaration order

Declare entities leaf-first. `Field.ref()` needs its target to already exist as a const:

```
AcmeUser       (leaf - no refs)
AcmeTask       (refs AcmeUser)
AcmeProject    (refs AcmeUser, collection of AcmeTask)
AcmeWorkspace  (collections of AcmeUser, AcmeProject)
AcmeRoot       (collection of AcmeWorkspace)
```

For circular references, use `Field.refThunk()` to defer resolution:

```typescript
export const AcmeTask: AcmeTask = EntityDef.create("AcmeTask", {
  title: Field.string(),
  project: Field.refThunk(() => AcmeProject),
});
```

## Define your schema

The schema declares your connector's complete data model and its entry points:

```typescript
// connectors/connector-acme/src/schema.ts
import { Schema } from "@max/core";
import { AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask } from "./entities.js";

export const AcmeSchema = Schema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask],
  roots: [AcmeRoot],
});
```

`roots` are the starting points for sync. The seeder creates root entities and the sync plan fans out from there.

## Define your context

Context holds the runtime dependencies your loaders will need - API clients, configuration values, workspace IDs.

:::tip
If your context includes an API client, you'll likely want to define [Operations](/connector/operations/) first. Operations wrap API calls with middleware (retries, rate limiting, logging), and your context will hold the operation executor rather than a raw HTTP client. Read the operations page before designing your context.
:::

```typescript
// connectors/connector-acme/src/context.ts
import { Context } from "@max/core";
import type { AcmeClientProvider } from "./acme-client.js";

export class AcmeAppContext extends Context {
  api = Context.instance<AcmeClientProvider>();
  workspaceId = Context.string;
}
```

Extend `Context` and use typed descriptors as field initializers:

| Descriptor | Use |
|------------|-----|
| `Context.instance<T>()` | Object instance (API client, service) |
| `Context.string` | String value |
| `Context.number` | Number value |
| `Context.boolean` | Boolean value |

The context is hydrated later when the connector is installed - you'll see this in [Wiring and Packaging](/connector/wiring-and-packaging/).

## What you have so far

At this point your connector has:

- Entity definitions with typed fields and relationships
- A schema that registers all entities and declares entry points
- A context class describing what runtime dependencies loaders will need

Next, you'll learn how to wrap your API calls in operations - giving the framework visibility into every external call your connector makes.

**Next: [Operations](/connector/operations/)**

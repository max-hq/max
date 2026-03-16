---
title: The Sync Pipeline
sidebar:
  order: 3
---

With your entities and schema defined, the next step is teaching Max how to fetch data from your API. This involves three concepts: **loaders** (fetch data), **resolvers** (wire fields to loaders), and a **seeder** (orchestrate the sync).

## How sync works

When Max syncs a connector, three systems cooperate:

1. The **Seeder** produces a **SyncPlan** - an ordered list of steps like "discover all workspaces", "load user fields".
2. The sync engine walks each step. For a `loadFields` step, it looks up the **Resolver** for that entity type, which maps each field to a **Loader**.
3. The engine calls the loader, which hits your API and returns `EntityInput` values. The engine stores these, then moves on.

```
SyncPlan          Resolver              Loader              Your API
  |                 |                     |                    |
  |-- step 1 -----> |                     |                    |
  |  "load user     |-- displayName? ---> |                    |
  |   fields"       |-- email? ---------> |  (same loader)     |
  |                 |                     |--- getUser(id) --> |
  |                 |                     |<-- { ... } --------|
  |                 |                     |                    |
  |-- step 2 -----> |                     |                    |
  |  "load user     |-- users? ---------> |                    |
  |   collection"   |                     |--- listUsers() --> |
  |                 |                     |<-- [...] ----------|
```

The key insight: **resolvers are the wiring layer**. They don't contain logic - they tell the engine which loader to call for each field. A single loader can serve multiple fields (one API call populates many fields), and the engine batches intelligently.

## Create loaders

Loaders fetch data from your API and return `EntityInput` values.

### Entity loader

Fetches fields for a single entity by ref:

```typescript
// connectors/connector-acme/src/resolvers/user-resolver.ts
import { Loader, EntityInput } from "@max/core";
import { AcmeUser } from "../entities.js";
import { AcmeAppContext } from "../context.js";
import { GetUser } from "../operations.js";

const UserBasicLoader = Loader.entity({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,
  strategy: "autoload",

  async load(ref, env) {
    const user = await env.ops.execute(GetUser, { id: ref.id });
    return EntityInput.create(ref, {
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      active: user.active,
    });
  },
});
```

### Batched entity loader

Fetches fields for many entities in one API call. Prefer this when the API supports batch retrieval:

```typescript
const UserBatchLoader = Loader.entityBatched({
  name: "acme:user:batch",
  context: AcmeAppContext,
  entity: AcmeUser,

  async load(refs, env) {
    const users = await env.ctx.api.client.getUserBatch(refs.map(r => r.id));
    return Batch.buildFrom(
      users.map(u => EntityInput.create(AcmeUser.ref(u.id), {
        displayName: u.displayName,
        email: u.email,
      }))
    ).withKey(input => input.ref);
  },
});
```

### Collection loader

Fetches a paginated list of child entities belonging to a parent:

```typescript
// connectors/connector-acme/src/resolvers/workspace-resolver.ts
import { ListUsers } from "../operations.js";

const WorkspaceUsersLoader = Loader.collection({
  name: "acme:workspace:users",
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeUser,

  async load(ref, page, env) {
    const users = await env.ops.execute(ListUsers, { workspaceId: ref.id });
    const items = users.map(u =>
      EntityInput.create(AcmeUser.ref(u.id), {
        displayName: `${u.firstName} ${u.lastName}`,
        email: u.email,
        role: u.role,
        active: u.active
      })
    );
    return Page.from(items, false, undefined);
  },
});
```

The `page` parameter carries `cursor` and `limit` for APIs that paginate. Return `Page.from(items, hasMore, nextCursor)` - the engine automatically follows pagination when `hasMore` is true.

Pick the largest page size the API allows. Fewer round-trips means faster syncs.

:::tip
If your API returns data for multiple entity types in one call (e.g., an issues endpoint that includes user and label data), see [Source + Derivation](/connector/advanced-patterns/) instead. It lets you paginate once and fan out to multiple entity types automatically.
:::

### Loader variants at a glance

| Factory | Signature | Use case |
|---------|-----------|----------|
| `Loader.entity()` | `(ref, env) => EntityInput` | Fetch one entity |
| `Loader.entityBatched()` | `(refs[], env) => Batch<EntityInput>` | Fetch many in one call |
| `Loader.collection()` | `(parentRef, page, env) => Page<EntityInput>` | Paginated children |

## Create resolvers

A resolver maps an entity's fields to the loaders that populate them. Each field points to exactly one loader.

```typescript
import { Resolver } from "@max/core";

const AcmeUserResolver = Resolver.for(AcmeUser, {
  displayName: UserBasicLoader.field("displayName"),
  email: UserBasicLoader.field("email"),
  role: UserBasicLoader.field("role"),
  active: UserBasicLoader.field("active"),
});
```

When the engine needs `displayName` and `email`, it sees both map to `UserBasicLoader` and makes a single call.

For collection fields, call `.field()` with no argument:

```typescript
const AcmeWorkspaceResolver = Resolver.for(AcmeWorkspace, {
  name: WorkspaceBasicLoader.field("name"),
  users: WorkspaceUsersLoader.field(),
  projects: WorkspaceProjectsLoader.field(),
});
```

## Create a seeder and sync plan

The seeder bootstraps a sync from cold start. It stores an initial root entity and returns a plan describing what to sync and in what order.

```typescript
// connectors/connector-acme/src/seeder.ts
import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { AcmeRoot, AcmeWorkspace, AcmeUser, AcmeProject, AcmeTask } from "./entities.js";
import { AcmeAppContext } from "./context.js";

export const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all workspaces from root
      Step.forRoot(rootRef).loadCollection("workspaces"),
      // 2. Load workspace names
      Step.forAll(AcmeWorkspace).loadFields("name"),
      // 3. Discover users and projects (independent - run concurrently)
      Step.concurrent([
        Step.forAll(AcmeWorkspace).loadCollection("users"),
        Step.forAll(AcmeWorkspace).loadCollection("projects"),
      ]),
      // 4. Load details (depends on step 3 having discovered the entities)
      Step.concurrent([
        Step.forAll(AcmeUser).loadFields("displayName", "email", "role", "active"),
        Step.forAll(AcmeProject).loadFields("name", "description", "status", "owner"),
      ]),
      // 5. Discover tasks per project
      Step.forAll(AcmeProject).loadCollection("tasks"),
    ]);
  },
});
```

### Step targets

| Target | Meaning |
|--------|---------|
| `Step.forRoot(ref)` | A single known root entity |
| `Step.forAll(EntityDef)` | All entities of this type in the store |
| `Step.forOne(ref)` | A single known entity |

### Step operations

| Operation | Meaning |
|-----------|---------|
| `.loadFields("a", "b")` | Load named fields via their resolvers |
| `.loadCollection("field")` | Load a collection field (paginated) |

Steps run sequentially by default - each waits for the previous step to finish. This matters because later steps depend on entities discovered by earlier ones.

Use `Step.concurrent()` to run independent steps in parallel. The rule: if two steps don't depend on each other's discovered entities, they can be concurrent.

## What you have so far

Your connector now has:

- Loaders that fetch data from your API
- Resolvers that wire entity fields to loaders
- A seeder that orchestrates the full sync sequence

Next, you'll build the onboarding flow - the step-by-step setup users go through when connecting your connector.

**Next: [Onboarding](/connector/onboarding/)**

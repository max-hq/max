---
title: Operations
sidebar:
  order: 2
---

Operations are named, typed wrappers around your API calls. They give the framework visibility into every external call your connector makes, enabling middleware like rate limiting, retries, and logging without changing connector code.

## Why operations?

Without operations, loaders call APIs directly:

```typescript
async load(ref, env) {
  const user = await env.ctx.api.client.getUser(ref.id);
}
```

This works, but the framework can't see inside. It doesn't know what API calls are happening, can't count them, can't rate-limit them, and can't replay or mock them.

Operations make each API call a first-class thing:

```typescript
async load(ref, env) {
  const user = await env.ops.execute(GetUser, { id: ref.id });
}
```

Now the framework can intercept every call through middleware - counting, rate limiting, recording, and mocking all become possible without changing connector code.

## Define an operation

An operation is a named function with typed input and output:

```typescript
// connectors/connector-acme/src/operations.ts

export const GetUser = Operation.define({
  name: "acme:user:get",
  context: AcmeAppContext,
  async handle(input: { id: string }, ctx): Promise<User> {
    return ctx.api.client.getUser(input.id);
  },
});
```

Name convention is `connector:entity:verb` - e.g. `acme:user:get`, `acme:workspace:list`.

The operation carries its type information as phantom types. When a loader calls `env.ops.execute(GetUser, { id })`, TypeScript infers the input type (`{ id: string }`) and return type (`Promise<User>`) from the token.

Keep inputs explicit - pass primitive values (`{ id: string }`) rather than framework types like `Ref`. The handler should do one thing: call the API and return the result. Let the loader handle mapping to `EntityInput`.

## Use operations in loaders

When you build loaders in the [next part](/connector/sync-pipeline/), they'll call operations through `env.ops.execute`:

```typescript
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
    });
  },
});
```

The `env` parameter provides both `env.ctx` (your connector's context) and `env.ops` (the operation executor).

## Register operations

Export operations as a const array and register them on the connector definition:

```typescript
export const AcmeOperations = [
  ListWorkspaces, GetWorkspace,
  ListUsers, GetUser,
  ListProjects, GetProject,
  ListTasks,
] as const;
```

```typescript
const AcmeDef = ConnectorDef.create({
  // ...
  operations: [...AcmeOperations],
});
```

You'll see the full `ConnectorDef` assembly in [Wiring and Packaging](/connector/wiring-and-packaging/).

## Limits

Operations can declare a concurrency limit to prevent overwhelming external APIs:

```typescript
import { Limit } from "@max/core";

const AcmeApi = Limit.concurrent("acme:api", 50);

export const GetUser = Operation.define({
  name: "acme:user:get",
  limit: AcmeApi,
  async handle(input: { id: string }, ctx) {
    return ctx.api.client.getUser(input.id);
  },
});
```

Operations sharing the same `Limit` instance share a concurrency gate. In this example, all operations using `AcmeApi` collectively cannot exceed 50 concurrent executions. This is useful when an API has a global rate limit across all endpoints.

Name limits after the resource they protect: `acme:api`, `gmail:batch`, `linear:graphql`.

Operations without a `limit` are unrestricted - they execute immediately.

For how limits are enforced at the framework level, see [Operations and Middleware](/reference/operations/#flow-control-and-limits).

## What you have so far

Your connector now has:

- Entities, schema, and context (data model)
- Operations wrapping every API call (observability and middleware)

Next, you'll build the sync pipeline - loaders that fetch data using your operations, resolvers that wire fields to loaders, and a seeder that orchestrates the full sync sequence.

**Next: [The Sync Pipeline](/connector/sync-pipeline/)**

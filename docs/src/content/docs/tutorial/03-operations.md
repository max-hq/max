---
title: Operations
sidebar:
  order: 3
---

Operations are named, typed wrappers around your API calls. They sit between loaders and the raw API, giving the framework visibility into every external call your connector makes.

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
import { Operation } from "@max/core";
import type { InferContext } from "@max/core";
import type { User } from "@max/acme";
import type { AcmeAppContext } from "./context.js";

type Ctx = InferContext<AcmeAppContext>;

export const GetUser = Operation.define({
  name: "acme:user:get",
  async handle(input: { id: string }, ctx: Ctx): Promise<User> {
    return ctx.api.client.getUser(input.id);
  },
});
```

Name convention is `connector:entity:verb` - e.g. `acme:user:get`, `acme:workspace:list`.

The operation carries its type information as phantom types. When a loader calls `env.ops.execute(GetUser, { id })`, TypeScript infers the input type (`{ id: string }`) and return type (`Promise<User>`) from the token.

Keep inputs explicit - pass primitive values (`{ id: string }`) rather than framework types like `Ref`. The handler should do one thing: call the API and return the result. Let the loader handle mapping to `EntityInput`.

## Use operations in loaders

Loaders call operations through `env.ops.execute`:

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

You'll see the full `ConnectorDef` assembly in [Wiring and Packaging](/tutorial/05-wiring-and-packaging/).

For more on the middleware system and writing custom middleware, see the [Operations reference](/reference/operations/).

## What you have so far

Your connector now has:

- Entities, schema, and context (data model)
- Loaders, resolvers, and a seeder (sync pipeline)
- Operations wrapping every API call (observability)

Next, you'll build the onboarding flow - the step-by-step setup users go through when installing your connector.

**Next: [Onboarding](/tutorial/04-onboarding/)**

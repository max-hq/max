---
title: Operations
sidebar:
  order: 3
---

Operations are named, typed wrappers around external API calls. They sit between loaders and the raw API, giving the framework visibility into every call a connector makes.

---

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

---

## Defining operations

An operation is a named function with typed input and output. Define them with `Operation.define`:

```typescript
// connectors/connector-acme/src/operations.ts
import { Operation } from "@max/core";
import type { InferContext } from "@max/core";
import type { User } from "@max/acme";
import type { AcmeAppContext } from "./context.js";

type Ctx = InferContext<AcmeAppContext>;

const GetUser = Operation.define({
  name: "acme:user:get",
  async handle(input: { id: string }, ctx: Ctx) {
    return ctx.api.client.getUser(input.id);
  },
});
```

The operation carries its type information as phantom types. When a loader calls `env.ops.execute(GetUser, { id })`, TypeScript infers the input type (`{ id: string }`) and return type (`Promise<User>`) from the `GetUser` token.

### Name convention

Use `connector:entity:verb`:

| Operation | Name |
|-----------|------|
| Get a single user | `acme:user:get` |
| List all workspaces | `acme:workspace:list` |
| List a team's issues | `linear:team:issues` |

### Handler signature

The handler receives two arguments:

| Argument | Type | What it is |
|----------|------|------------|
| `input` | Typed per operation | The data needed for the API call |
| `ctx` | `InferContext<YourContext>` | The connector's resolved context |

Keep inputs explicit - pass primitive values (`{ id: string }`) rather than framework types like `Ref`. The handler should do one thing: call the API and return the result. Let the loader handle mapping to `EntityInput`.

---

## Using operations in loaders

Loaders receive an `env` parameter (a `LoaderEnv`) that contains both the connector context and the operation executor:

| Field | What it is |
|-------|------------|
| `env.ctx` | The connector's context (API client, config, etc.) |
| `env.ops` | The operation executor |

Call operations through `env.ops.execute`:

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

```typescript
const WorkspaceUsersLoader = Loader.collection({
  name: "acme:workspace:users",
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeUser,

  async load(ref, page, env) {
    const users = await env.ops.execute(ListUsers, { workspaceId: ref.id });
    const items = users.map((u) =>
      EntityInput.create(AcmeUser.ref(u.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});
```

---

## Registering operations

Operations are registered on the `ConnectorDef` so the framework can discover them:

```typescript
import { AcmeOperations } from "./operations.js";

const AcmeDef = ConnectorDef.create({
  name: "acme",
  // ...
  resolvers: [AcmeRootResolver, AcmeUserResolver, AcmeWorkspaceResolver],
  operations: [...AcmeOperations],
});
```

Export your operations as a const array for easy registration:

```typescript
export const AcmeOperations = [
  ListWorkspaces, GetWorkspace,
  ListUsers, GetUser,
  ListProjects, GetProject,
  ListTasks,
] as const;
```

---

## Middleware

Operations pass through a middleware pipeline before reaching the handler. Middleware can observe, modify, or short-circuit execution.

```
execute(GetUser, { id })
    |
    v
[counting middleware]  ->  [rate limiter]  ->  [handler]
    |                          |                   |
    v                          v                   v
  count++               check limits         ctx.api.client.getUser(id)
```

### Counting middleware

The only middleware shipped today. It tracks how many times each operation is called during a sync:

```typescript
import { countingMiddleware } from "@max/execution";

const { middleware, counts } = countingMiddleware();
const dispatcher = new DefaultOperationDispatcher([middleware]);

// ... after sync ...
const c = counts();
// { total: 47, byOperation: { "acme:user:get": 12, "acme:workspace:list": 1, ... } }
```

### Writing middleware

A middleware function receives the operation, input, and a `next` function:

```typescript
import type { OperationMiddleware } from "@max/execution";

const logger: OperationMiddleware = async (op, input, next) => {
  console.log(`-> ${op.name}`);
  const result = await next();
  console.log(`<- ${op.name}`);
  return result;
};
```

---

## Architecture

Operations span two packages:

| Package | What lives there | Why |
|---------|-----------------|-----|
| `@max/core` | `Operation`, `OperationExecutor`, `LoaderEnv` | Connector authors type against these |
| `@max/execution` | `OperationDispatcher`, `DefaultOperationDispatcher`, middleware | Framework internals connectors never see |

The separation is intentional. Connector code imports from `@max/core` and calls `env.ops.execute()`. How that call is dispatched (middleware, mocking, replay) is decided by the framework at wiring time - connectors don't need to know.

```
Connector code                Framework
--------------                ---------
env.ops.execute(GetUser, {id})
       |
       v
  OperationExecutor           OperationDispatcher
  (typed, safe)         --->  (middleware pipeline)
                                     |
                                     v
                              op.handle(input, ctx)
```

---

## Testing

For tests that don't exercise operations, use `BasicLoaderEnv`:

```typescript
import { BasicLoaderEnv } from "@max/core";

const ctx = Context.build(TestContext, { value: "test" });
const env = new BasicLoaderEnv(ctx);
const result = await source.fetch(ref, page, env);
```

`BasicLoaderEnv` calls operation handlers directly without middleware. If a loader calls `env.ops.execute()` and the operation is properly defined, it works. If no operation is defined, the call goes through `BasicOperationExecutor` which invokes the handler with the bound context.

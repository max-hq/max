---
title: Operations and Middleware
sidebar:
  order: 2
---

This page covers how operations are executed at the framework level - the dispatch pipeline, middleware model, flow control, and testing. For defining and using operations in a connector, see the [Connector SDK Operations](/connector/operations/) tutorial.

## The execution pipeline

When a loader calls `env.ops.execute(GetUser, { id })`, the call passes through several layers before reaching the handler:

```d2
direction: down

Connector Code: {
  loader: "env.ops.execute(GetUser, { id })"
  executor: OperationExecutor {
    style.font-size: 13
    tooltip: "Typed interface in @max/core"
  }
  loader -> executor
}

Framework: {
  bridge: DispatchingOperationExecutor
  pipeline: Middleware Pipeline {
    counting: Counting Middleware
    ratelimit: Rate Limiting Middleware
    handler: "op.handle(input, env)"
    counting -> ratelimit -> handler
  }
  bridge -> pipeline.counting
}

Connector Code.executor -> Framework.bridge: dispatches to
```

The separation is intentional. Connector code imports `OperationExecutor` from `@max/core` and calls `execute()`. How that call is dispatched - what middleware runs, whether limits are enforced - is decided by the framework at wiring time. Connectors don't need to know.

## Middleware

Middleware functions intercept operation execution. They can observe, modify, or short-circuit calls.

### Signature

```typescript
type OperationMiddleware = (
  op: OperationAny,
  input: unknown,
  next: () => Promise<unknown>,
) => Promise<unknown>;
```

- `op` - the operation being executed (carries `name`, `handle`, `limit`, etc.)
- `input` - the input payload (untyped at the middleware level)
- `next` - calls the next middleware in the chain, or the handler if this is the last middleware

Middleware can run code before and after `next()`, modify the return value, catch errors, or skip `next()` entirely to short-circuit.

### The default stack

`DefaultOperationDispatcher.withDefaults()` builds the standard pipeline:

```typescript
const provider = new LocalFlowControllerProvider();
const { dispatcher, counts } = DefaultOperationDispatcher.withDefaults(provider);
```

This wires two middleware in order:

1. **Counting middleware** - tracks invocation counts per operation
2. **Rate limiting middleware** - enforces concurrency limits via flow controllers

### Counting middleware

Tracks how many times each operation is called during a sync:

```typescript
import { countingMiddleware } from "@max/execution";

const { middleware, counts } = countingMiddleware();

// After a sync completes:
const c = counts();
// { total: 47, byOperation: { "acme:user:get": 12, "acme:workspace:list": 1, ... } }
```

The factory returns both the middleware and a `counts()` accessor. Counts accumulate across the lifetime of the middleware instance.

### Writing custom middleware

```typescript
import type { OperationMiddleware } from "@max/execution";

const logger: OperationMiddleware = async (op, input, next) => {
  console.log(`-> ${op.name}`);
  const result = await next();
  console.log(`<- ${op.name}`);
  return result;
};

const dispatcher = new DefaultOperationDispatcher([logger]);
```

Middleware is chained with `reduceRight` - the first middleware in the array is the outermost wrapper.

## Flow control and limits

Operations can declare a concurrency limit. The rate limiting middleware enforces these limits using flow controllers.

### Declaring limits

Connectors attach a `Limit` to operations that should be throttled:

```typescript
import { Limit, Operation } from "@max/core";

const AcmeApi = Limit.concurrent("acme:api", 50);

const GetUser = Operation.define({
  name: "acme:user:get",
  limit: AcmeApi,
  async handle(input: { id: string }, env) {
    return env.ctx.api.client.getUser(input.id);
  },
});
```

Multiple operations can share the same limit by referencing the same `Limit` instance. In this example, all operations using `AcmeApi` collectively cannot exceed 50 concurrent executions.

### How limits are enforced

```d2
direction: right

loader: Loader calls execute()
middleware: Rate Limiting Middleware {
  check: "op.limit?"
  no_limit: "No limit" {style.font-size: 12}
  has_limit: "Has limit" {style.font-size: 12}
  check -> no_limit: "undefined"
  check -> has_limit: "Limit defined"
}
provider: FlowControllerProvider
fc: FlowController {
  semaphore: "SemaphoreFlowController\nacquire slot, run, release"
}
handler: "op.handle()"

loader -> middleware.check
middleware.no_limit -> handler: "execute immediately"
middleware.has_limit -> provider: "provider.get(limit)"
provider -> fc.semaphore
fc.semaphore -> handler: "when slot available"
```

The rate limiting middleware checks each operation's `limit` property:

```typescript
const rateLimitingMiddleware = (provider: FlowControllerProvider): OperationMiddleware => {
  return async (op, _input, next) => {
    const limit = op.limit;
    if (!limit) return next();
    return provider.get(limit).run(next);
  };
};
```

If the operation has no limit, execution proceeds immediately. Otherwise, `provider.get(limit)` returns a `FlowController` that gates execution.

### FlowController

The `FlowController` interface is simple:

```typescript
interface FlowController {
  run<T>(fn: () => Promise<T>): Promise<T>;
}
```

It wraps a function and decides when to execute it. Implementations:

| Implementation | Behaviour |
|----------------|-----------|
| `NoOpFlowController` | Runs immediately, no limits |
| `SemaphoreFlowController` | Limits concurrent executions using a semaphore |

`SemaphoreFlowController` acquires a slot before running, and releases it after completion (or failure). If all slots are taken, execution waits in a queue.

### Limit strategies

Currently one strategy is supported:

```typescript
const limit = Limit.concurrent("acme:api", 50);
// { name: "acme:api", strategy: { kind: "concurrency", max: 50 } }
```

The `LocalFlowControllerProvider` creates and caches `SemaphoreFlowController` instances by limit name. Requesting the same name with a different strategy is a configuration error and throws immediately.

## Package boundaries

| Package | Contains | Audience |
|---------|----------|----------|
| `@max/core` | `Operation`, `Limit`, `OperationExecutor`, `LoaderEnv`, `FlowController` (interface) | Connector authors |
| `@max/execution` | `DefaultOperationDispatcher`, middleware, `SemaphoreFlowController`, `LocalFlowControllerProvider` | Framework internals |

Connector code only touches `@max/core` types. The execution machinery in `@max/execution` is wired by the platform at startup.

## Testing

### BasicLoaderEnv (no middleware)

For tests that don't need the full pipeline:

```typescript
import { BasicLoaderEnv } from "@max/core";

const ctx = Context.build(TestContext, { value: "test" });
const env = new BasicLoaderEnv(ctx);
```

`BasicLoaderEnv` creates a `BasicOperationExecutor` that calls `op.handle()` directly - no middleware, no flow control. Operations work, but middleware doesn't run.

### StandardLoaderEnv (full pipeline)

For tests that exercise the complete execution path:

```typescript
import { StandardLoaderEnv } from "@max/execution";

const provider = new LocalFlowControllerProvider();
const { dispatcher } = DefaultOperationDispatcher.withDefaults(provider);
const env = new StandardLoaderEnv(ctx, dispatcher);
```

This wires the full middleware stack, including counting and rate limiting.

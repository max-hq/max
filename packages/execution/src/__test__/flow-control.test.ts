/**
 * Tests for FlowController, LocalFlowControllerProvider,
 * and rate-limiting middleware integration.
 */

import { describe, test, expect } from "bun:test";
import { Context, Env, Limit, NoOpFlowController, Operation } from "@max/core";
import { SemaphoreFlowController } from "../semaphore-flow-controller.js";
import { TokenBucketFlowController } from "../token-bucket-flow-controller.js";
import { CompositeFlowController } from "../composite-flow-controller.js";
import { LocalFlowControllerProvider } from "../local-flow-controller-provider.js";
import { rateLimitingMiddleware } from "../middleware/rate-limiting-middleware.js";
import { DefaultOperationDispatcher } from "../operation-dispatcher.js";

// ============================================================================
// SemaphoreFlowController
// ============================================================================

describe("SemaphoreFlowController", () => {
  test("run() executes the function and returns its result", async () => {
    const fc = new SemaphoreFlowController(5);
    const result = await fc.run(async () => 42);
    expect(result).toBe(42);
  });

  test("run() propagates errors", async () => {
    const fc = new SemaphoreFlowController(5);
    expect(fc.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  test("gates concurrency to max", async () => {
    const fc = new SemaphoreFlowController(2);
    let active = 0;
    let maxActive = 0;

    const task = () => fc.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      // Yield to let other tasks start if they can
      await new Promise(r => setTimeout(r, 10));
      active--;
    });

    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxActive).toBe(2);
  });

  test("releases slot even when fn throws", async () => {
    const fc = new SemaphoreFlowController(1);

    // First call throws
    await fc.run(async () => { throw new Error("fail"); }).catch(() => {});

    // Second call should still work (slot was released)
    const result = await fc.run(async () => "ok");
    expect(result).toBe("ok");
  });
});

// ============================================================================
// NoOpFlowController
// ============================================================================

describe("NoOpFlowController", () => {
  test("run() executes immediately", async () => {
    const fc = new NoOpFlowController();
    const result = await fc.run(async () => "hello");
    expect(result).toBe("hello");
  });
});

// ============================================================================
// LocalFlowControllerProvider
// ============================================================================

describe("LocalFlowControllerProvider", () => {
  test("returns a FlowController for a limit", () => {
    const provider = new LocalFlowControllerProvider();
    const limit = Limit.concurrent("test:api", 10);
    const fc = provider.get(limit);
    expect(fc).toBeDefined();
  });

  test("returns the same FlowController for the same limit name", () => {
    const provider = new LocalFlowControllerProvider();
    const limit = Limit.concurrent("test:api", 10);
    const fc1 = provider.get(limit);
    const fc2 = provider.get(limit);
    expect(fc1).toBe(fc2);
  });

  test("returns different FlowControllers for different limit names", () => {
    const provider = new LocalFlowControllerProvider();
    const fc1 = provider.get(Limit.concurrent("pool:a", 10));
    const fc2 = provider.get(Limit.concurrent("pool:b", 10));
    expect(fc1).not.toBe(fc2);
  });

  test("throws on same name with different concurrency", () => {
    const provider = new LocalFlowControllerProvider();
    provider.get(Limit.concurrent("test:api", 10));

    expect(() => provider.get(Limit.concurrent("test:api", 25))).toThrow(
      /limit "test:api"/i,
    );
  });

  test("accepts same name with same concurrency", () => {
    const provider = new LocalFlowControllerProvider();
    const fc1 = provider.get(Limit.concurrent("test:api", 10));
    const fc2 = provider.get(Limit.concurrent("test:api", 10));
    expect(fc1).toBe(fc2);
  });

  test("created FlowController respects concurrency", async () => {
    const provider = new LocalFlowControllerProvider();
    const fc = provider.get(Limit.concurrent("test:gate", 2));

    let active = 0;
    let maxActive = 0;

    const task = () => fc.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
    });

    await Promise.all([task(), task(), task(), task()]);

    expect(maxActive).toBe(2);
  });
});

// ============================================================================
// TokenBucketFlowController
// ============================================================================

describe("TokenBucketFlowController", () => {
  test("run() executes the function and returns its result", async () => {
    const fc = new TokenBucketFlowController(1000);
    const result = await fc.run(async () => 42);
    expect(result).toBe(42);
  });

  test("run() propagates errors", async () => {
    const fc = new TokenBucketFlowController(1000);
    expect(fc.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  test("throttles beyond the rate", async () => {
    // 50/sec = 1 token every 20ms
    const fc = new TokenBucketFlowController(50);
    const timestamps: number[] = [];

    // Drain the initial burst
    for (let i = 0; i < 50; i++) {
      await fc.run(async () => {});
    }

    // Next 3 calls must wait for token refills
    const start = Date.now();
    for (let i = 0; i < 3; i++) {
      await fc.run(async () => { timestamps.push(Date.now()); });
    }
    const elapsed = Date.now() - start;

    // 3 tokens at 50/sec = ~60ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

// ============================================================================
// CompositeFlowController
// ============================================================================

describe("CompositeFlowController", () => {
  test("chains controllers - both must permit", async () => {
    const sem = new SemaphoreFlowController(2);
    const rate = new TokenBucketFlowController(1000);
    const fc = new CompositeFlowController([rate, sem]);

    let active = 0;
    let maxActive = 0;

    const task = () => fc.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
    });

    await Promise.all([task(), task(), task(), task()]);

    // Concurrency is bounded by the semaphore at 2
    expect(maxActive).toBe(2);
  });

  test("propagates errors through the chain", async () => {
    const sem = new SemaphoreFlowController(5);
    const rate = new TokenBucketFlowController(1000);
    const fc = new CompositeFlowController([rate, sem]);

    await fc.run(async () => { throw new Error("chain-fail"); }).catch(() => {});

    // Should still work after error (slots released)
    const result = await fc.run(async () => "ok");
    expect(result).toBe("ok");
  });
});

// ============================================================================
// LocalFlowControllerProvider - rate and composite limits
// ============================================================================

describe("LocalFlowControllerProvider (rate + composite)", () => {
  test("creates a rate-only controller", async () => {
    const provider = new LocalFlowControllerProvider();
    const fc = provider.get(Limit.rate("test:rate", 1000));
    const result = await fc.run(async () => "ok");
    expect(result).toBe("ok");
  });

  test("creates a composite controller from Limit.throttle()", async () => {
    const provider = new LocalFlowControllerProvider();
    const fc = provider.get(Limit.throttle("test:throttle", { concurrent: 2, rate: 1000 }));

    let active = 0;
    let maxActive = 0;

    const task = () => fc.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
    });

    await Promise.all([task(), task(), task(), task()]);

    // Concurrency capped at 2 by the composite
    expect(maxActive).toBe(2);
  });

  test("throws on same name with different rate", () => {
    const provider = new LocalFlowControllerProvider();
    provider.get(Limit.rate("test:api", 100));

    expect(() => provider.get(Limit.rate("test:api", 200))).toThrow(/limit "test:api"/i);
  });

  test("throws on same name with concurrency vs throttle", () => {
    const provider = new LocalFlowControllerProvider();
    provider.get(Limit.concurrent("test:api", 10));

    expect(() => provider.get(Limit.throttle("test:api", { concurrent: 10, rate: 100 }))).toThrow(
      /limit "test:api"/i,
    );
  });

  test("accepts same name with identical throttle config", () => {
    const provider = new LocalFlowControllerProvider();
    const fc1 = provider.get(Limit.throttle("test:api", { concurrent: 10, rate: 100 }));
    const fc2 = provider.get(Limit.throttle("test:api", { concurrent: 10, rate: 100 }));
    expect(fc1).toBe(fc2);
  });
});

// ============================================================================
// Rate-limiting middleware + provider integration
// ============================================================================

describe("rateLimitingMiddleware", () => {
  class TestCtx extends Context {}
  const env = Env.operation({ ctx: Context.build(TestCtx, {}) });

  const TestLimit = Limit.concurrent("test:api", 2);

  const LimitedOp = Operation.define({
    name: "test:limited",
    context: TestCtx,
    limit: TestLimit,
    async handle(input: { value: number }, _env) {
      return input.value;
    },
  });

  const UnlimitedOp = Operation.define({
    name: "test:unlimited",
    context: TestCtx,
    async handle(input: { value: number }, _env) {
      return input.value;
    },
  });

  test("operations without limit execute immediately", async () => {
    const provider = new LocalFlowControllerProvider();
    const middleware = rateLimitingMiddleware(provider);
    const dispatcher = new DefaultOperationDispatcher([middleware]);

    const result = await dispatcher.dispatch(UnlimitedOp, { value: 42 }, env);
    expect(result).toBe(42);
  });

  test("operations with limit are flow-controlled", async () => {
    const provider = new LocalFlowControllerProvider();
    const middleware = rateLimitingMiddleware(provider);
    const dispatcher = new DefaultOperationDispatcher([middleware]);

    let active = 0;
    let maxActive = 0;

    const SlowOp = Operation.define({
      name: "test:slow",
      context: TestCtx,
      limit: TestLimit,
      async handle(_input: {}, _env) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
        return "done";
      },
    });

    await Promise.all([
      dispatcher.dispatch(SlowOp, {}, env),
      dispatcher.dispatch(SlowOp, {}, env),
      dispatcher.dispatch(SlowOp, {}, env),
      dispatcher.dispatch(SlowOp, {}, env),
    ]);

    expect(maxActive).toBe(2);
  });

  test("operations sharing a limit share the same flow controller", async () => {
    const provider = new LocalFlowControllerProvider();
    const middleware = rateLimitingMiddleware(provider);
    const dispatcher = new DefaultOperationDispatcher([middleware]);

    let active = 0;
    let maxActive = 0;

    const OpA = Operation.define({
      name: "test:a",
      context: TestCtx,
      limit: TestLimit,
      async handle(_input: {}, _env) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
        return "a";
      },
    });

    const OpB = Operation.define({
      name: "test:b",
      context: TestCtx,
      limit: TestLimit,
      async handle(_input: {}, _env) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
        return "b";
      },
    });

    await Promise.all([
      dispatcher.dispatch(OpA, {}, env),
      dispatcher.dispatch(OpB, {}, env),
      dispatcher.dispatch(OpA, {}, env),
      dispatcher.dispatch(OpB, {}, env),
    ]);

    // Limit is 2 - shared across OpA and OpB
    expect(maxActive).toBe(2);
  });
});

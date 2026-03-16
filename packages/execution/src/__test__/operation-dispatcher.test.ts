/**
 * Tests for DefaultOperationDispatcher, DispatchingOperationExecutor,
 * and countingMiddleware.
 */

import { describe, test, expect } from "bun:test";
import {Context, Env, Operation } from "@max/core";
import { DefaultOperationDispatcher } from "../operation-dispatcher.js";
import { DispatchingOperationExecutor } from "../dispatching-operation-executor.js";
import { countingMiddleware } from "../middleware/counting-middleware.js";
import { LocalFlowControllerProvider } from "../local-flow-controller-provider.js";
import type { OperationMiddleware } from "../operation-dispatcher.js";

// ============================================================================
// Test Helpers
// ============================================================================

class TestCtxEmpty extends Context {}
class TestCtxPrefix extends Context {
  prefix = Context.string
}

const emptyEnv = Env.operation({ ctx: Context.build(TestCtxEmpty, {}) })

const Add = Operation.define({
  name: "test:add",
  context: TestCtxEmpty,
  async handle(input: { a: number; b: number }, _env) {
    return input.a + input.b;
  },
});

const Echo = Operation.define({
  name: "test:echo",
  context: TestCtxPrefix,
  async handle(input: { message: string }, env) {
    return `${env.ctx.prefix}: ${input.message}`;
  },
});

// ============================================================================
// DefaultOperationDispatcher
// ============================================================================

describe("DefaultOperationDispatcher", () => {
  test("dispatches to operation handler", async () => {
    const dispatcher = new DefaultOperationDispatcher();
    const result = await dispatcher.dispatch(Add, { a: 2, b: 3 }, emptyEnv);
    expect(result).toBe(5);
  });

  test("passes context to handler", async () => {
    const dispatcher = new DefaultOperationDispatcher();
    const env = Env.operation({ ctx: Context.build(TestCtxPrefix, { prefix: "bot" }) })
    const result = await dispatcher.dispatch(Echo, { message: "hello" }, env);
    expect(result).toBe("bot: hello");
  });

  test("runs middleware in order", async () => {
    const order: string[] = [];

    const first: OperationMiddleware = async (op, input, next) => {
      order.push("first:before");
      const result = await next();
      order.push("first:after");
      return result;
    };

    const second: OperationMiddleware = async (op, input, next) => {
      order.push("second:before");
      const result = await next();
      order.push("second:after");
      return result;
    };

    const dispatcher = new DefaultOperationDispatcher([first, second]);
    await dispatcher.dispatch(Add, { a: 1, b: 1 }, emptyEnv);

    expect(order).toEqual(["first:before", "second:before", "second:after", "first:after"]);
  });

  test("middleware can modify result", async () => {
    const doubler: OperationMiddleware = async (op, input, next) => {
      const result = (await next()) as number;
      return result * 2;
    };

    const dispatcher = new DefaultOperationDispatcher([doubler]);
    const result = await dispatcher.dispatch(Add, { a: 3, b: 4 }, emptyEnv);
    expect(result).toBe(14);
  });

  test("withDefaults creates dispatcher with counting middleware", async () => {
    const { dispatcher, counts } = DefaultOperationDispatcher.withDefaults(new LocalFlowControllerProvider());
    const prefixEnv = Env.operation({ ctx: Context.build(TestCtxPrefix, { prefix: "x" }) })

    await dispatcher.dispatch(Add, { a: 1, b: 2 }, emptyEnv);
    await dispatcher.dispatch(Add, { a: 3, b: 4 }, emptyEnv);
    await dispatcher.dispatch(Echo, { message: "hi" }, prefixEnv);

    const c = counts();
    expect(c.total).toBe(3);
    expect(c.byOperation["test:add"]).toBe(2);
    expect(c.byOperation["test:echo"]).toBe(1);
  });
});

// ============================================================================
// countingMiddleware
// ============================================================================

describe("countingMiddleware", () => {
  test("starts at zero", () => {
    const { counts } = countingMiddleware();
    expect(counts().total).toBe(0);
    expect(counts().byOperation).toEqual({});
  });

  test("counts operations by name", async () => {
    const { middleware, counts } = countingMiddleware();
    const dispatcher = new DefaultOperationDispatcher([middleware]);
    const prefixEnv = Env.operation({ ctx: Context.build(TestCtxPrefix, { prefix: "" }) })

    await dispatcher.dispatch(Add, { a: 1, b: 1 }, emptyEnv);
    await dispatcher.dispatch(Echo, { message: "a" }, prefixEnv);
    await dispatcher.dispatch(Add, { a: 2, b: 2 }, emptyEnv);

    expect(counts().total).toBe(3);
    expect(counts().byOperation["test:add"]).toBe(2);
    expect(counts().byOperation["test:echo"]).toBe(1);
  });

  test("returns a copy of counts", () => {
    const { counts } = countingMiddleware();
    const c1 = counts();
    const c2 = counts();
    expect(c1).toEqual(c2);
    expect(c1.byOperation).not.toBe(c2.byOperation);
  });
});

// ============================================================================
// DispatchingOperationExecutor
// ============================================================================

describe("DispatchingOperationExecutor", () => {
  test("routes through dispatcher with bound context", async () => {
    const dispatcher = new DefaultOperationDispatcher();
    const env = Env.operation({ ctx: Context.build(TestCtxPrefix, { prefix: "test" }) })
    const executor = new DispatchingOperationExecutor(dispatcher, env);

    const result = await executor.execute(Echo, { message: "world" });
    expect(result).toBe("test: world");
  });

  test("middleware applies to executor calls", async () => {
    const { middleware, counts } = countingMiddleware();
    const dispatcher = new DefaultOperationDispatcher([middleware]);
    const executor = new DispatchingOperationExecutor(dispatcher, emptyEnv);

    await executor.execute(Add, { a: 5, b: 5 });
    await executor.execute(Add, { a: 1, b: 1 });

    expect(counts().total).toBe(2);
    expect(counts().byOperation["test:add"]).toBe(2);
  });

  test("propagates handler errors", async () => {
    const Fail = Operation.define({
      name: "test:fail",
      context: TestCtxEmpty,
      async handle(_input: {}, _env) {
        throw new Error("boom");
      },
    });

    const dispatcher = new DefaultOperationDispatcher();
    const executor = new DispatchingOperationExecutor(dispatcher, emptyEnv);

    expect(executor.execute(Fail, {})).rejects.toThrow("boom");
  });
});

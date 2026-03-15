/**
 * Tests for Operation definition and BasicOperationExecutor.
 */

import { describe, test, expect } from "bun:test";
import { Operation } from "../operation.js";
import { BasicOperationExecutor } from "../operation-executor.js";
import {Context} from "../context-def.js";
import {StaticTypeCompanion} from "../companion.js";
import {ClassOf} from "../type-system-utils.js";

// ============================================================================
// Test Helpers
// ============================================================================

class CtxUsers extends Context {
  users = Context.instance<Map<string, {name: string}>>()
}

const GetUser = Operation.define({
  name: "test:user:get",
  context: CtxUsers,
  async handle(input: { id: string }, ctx) {
    const user = ctx.users.get(input.id);
    if (!user) throw new Error(`User ${input.id} not found`);
    return user;
  },
});

class CtxItems extends Context {
  items = Context.instance<string[]>()
}

const ListItems = Operation.define({
  name: 'test:items:list',
  context: CtxItems,
  async handle(_input: {}, ctx) {
    return ctx.items
  },
})

// ============================================================================
// Operation.define
// ============================================================================

describe("Operation.define", () => {
  test("creates an operation with name and handle", () => {
    expect(GetUser.name).toBe("test:user:get");
    expect(typeof GetUser.handle).toBe("function");
  });

  test("handle function is callable", async () => {
    const ctx = Context.build(CtxUsers, { users: new Map([["u1", { name: "Alice" }]]) })
    const result = await GetUser.handle({ id: "u1" }, ctx);
    expect(result).toEqual({ name: "Alice" });
  });
});

// ============================================================================
// BasicOperationExecutor
// ============================================================================

describe("BasicOperationExecutor", () => {
  test("executes operation with bound context", async () => {
    const ctx = Context.build(CtxUsers, { users: new Map([["u1", { name: "Bob" }]]) })
    const executor = new BasicOperationExecutor(ctx);

    const result = await executor.execute(GetUser, { id: "u1" });
    expect(result).toEqual({ name: "Bob" });
  });

  test("propagates errors from handler", async () => {
    const ctx = Context.build(CtxUsers, { users: new Map<string, { name: string }>() })
    const executor = new BasicOperationExecutor(ctx);

    expect(executor.execute(GetUser, { id: "missing" })).rejects.toThrow("User missing not found");
  });

  test("works with different operations on same context shape", async () => {
    const ctx = Context.build(CtxItems, { items: ["a", "b", "c"] })
    const executor = new BasicOperationExecutor(ctx);

    const result = await executor.execute(ListItems, {});
    expect(result).toEqual(["a", "b", "c"]);
  });
});

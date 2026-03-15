/**
 * Tests for Operation definition and BasicOperationExecutor.
 */

import { describe, test, expect } from "bun:test";
import { Operation } from "../operation.js";
import { BasicOperationExecutor } from "../operation-executor.js";

// ============================================================================
// Test Helpers
// ============================================================================

const GetUser = Operation.define({
  name: "test:user:get",
  async handle(input: { id: string }, ctx: { users: Map<string, { name: string }> }) {
    const user = ctx.users.get(input.id);
    if (!user) throw new Error(`User ${input.id} not found`);
    return user;
  },
});

const ListItems = Operation.define({
  name: "test:items:list",
  async handle(_input: {}, ctx: { items: string[] }) {
    return ctx.items;
  },
});

// ============================================================================
// Operation.define
// ============================================================================

describe("Operation.define", () => {
  test("creates an operation with name and handle", () => {
    expect(GetUser.name).toBe("test:user:get");
    expect(typeof GetUser.handle).toBe("function");
  });

  test("handle function is callable", async () => {
    const ctx = { users: new Map([["u1", { name: "Alice" }]]) };
    const result = await GetUser.handle({ id: "u1" }, ctx);
    expect(result).toEqual({ name: "Alice" });
  });
});

// ============================================================================
// BasicOperationExecutor
// ============================================================================

describe("BasicOperationExecutor", () => {
  test("executes operation with bound context", async () => {
    const ctx = { users: new Map([["u1", { name: "Bob" }]]) };
    const executor = new BasicOperationExecutor(ctx);

    const result = await executor.execute(GetUser, { id: "u1" });
    expect(result).toEqual({ name: "Bob" });
  });

  test("propagates errors from handler", async () => {
    const ctx = { users: new Map<string, { name: string }>() };
    const executor = new BasicOperationExecutor(ctx);

    expect(executor.execute(GetUser, { id: "missing" })).rejects.toThrow("User missing not found");
  });

  test("works with different operations on same context shape", async () => {
    const ctx = { items: ["a", "b", "c"] };
    const executor = new BasicOperationExecutor(ctx);

    const result = await executor.execute(ListItems, {});
    expect(result).toEqual(["a", "b", "c"]);
  });
});

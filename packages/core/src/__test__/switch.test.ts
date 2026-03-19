/**
 * Tests for Switch - type-safe discriminated union matching with exhaustive case coverage.
 */

import {describe, test, expect} from "bun:test";
import {Switch, ErrUnmatchedSwitch, MaxError} from "../index.js";

// ============================================================================
// Test Types
// ============================================================================

type QueryEngine =
  | { type: "duckdb"; duck: { toSql(): string } }
  | { type: "sqlite"; underlying: string }
  | { type: "txt"; content: string };

/** Prevents TypeScript generic inference from narrowing to a single variant */
const makeInput = (v: QueryEngine): QueryEngine => v;

// ============================================================================
// Exhaustive (default)
// ============================================================================

describe("Switch - exhaustive", () => {
  test("dispatches to the correct case handler", () => {
    const input = makeInput({ type: "sqlite", underlying: "SELECT 1" });

    const result = Switch(input, "type", {
      duckdb: (v) => `duck:${v.duck.toSql()}`,
      sqlite: (v) => `sqlite:${v.underlying}`,
      txt: (v) => `txt:${v.content}`,
    });

    expect(result).toBe("sqlite:SELECT 1");
  });

  test("each handler receives the narrowed type", () => {
    const input = makeInput({
      type: "duckdb",
      duck: { toSql: () => "SELECT * FROM ducks" },
    });

    const result = Switch(input, "type", {
      duckdb: (v) => v.duck.toSql(),
      sqlite: (v) => v.underlying,
      txt: (v) => v.content,
    });

    expect(result).toBe("SELECT * FROM ducks");
  });

  test("throws ErrUnmatchedSwitch on runtime mismatch", () => {
    const input = { type: "postgres" } as unknown as QueryEngine;

    expect(() =>
      Switch(input, "type", {
        duckdb: () => "d",
        sqlite: () => "s",
        txt: () => "t",
      }),
    ).toThrow();

    try {
      Switch(input, "type", {
        duckdb: () => "d",
        sqlite: () => "s",
        txt: () => "t",
      });
    } catch (err) {
      expect(ErrUnmatchedSwitch.is(err)).toBe(true);
      if (ErrUnmatchedSwitch.is(err)) {
        expect(err.data.key).toBe("type");
        expect(err.data.actual).toBe("postgres");
        expect(err.data.expected).toBe("duckdb | sqlite | txt");
      }
    }
  });

  test("throws ErrUnmatchedSwitch when discriminant is undefined", () => {
    const input = {} as unknown as QueryEngine;

    try {
      Switch(input, "type", {
        duckdb: () => "d",
        sqlite: () => "s",
        txt: () => "t",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(ErrUnmatchedSwitch.is(err)).toBe(true);
      if (ErrUnmatchedSwitch.is(err)) {
        expect(err.data.actual).toBe("undefined");
      }
    }
  });
});

// ============================================================================
// Switch.else - partial matching
// ============================================================================

describe("Switch.else - partial matching", () => {
  test("matched case takes priority over else", () => {
    const input = makeInput({ type: "sqlite", underlying: "SELECT 1" });

    const result = Switch(input, "type", {
      sqlite: (v) => `matched:${v.underlying}`,
      [Switch.else]: () => "else",
    });

    expect(result).toBe("matched:SELECT 1");
  });

  test("else catches unhandled discriminant values", () => {
    const input = makeInput({ type: "txt", content: "hello" });

    const result = Switch(input, "type", {
      sqlite: () => "sqlite",
      [Switch.else]: (v) => `else:${v.type}`,
    });

    expect(result).toBe("else:txt");
  });

  test("else catches runtime mismatches", () => {
    const input = { type: "postgres" } as unknown as QueryEngine;

    const result = Switch(input, "type", {
      sqlite: () => "sqlite",
      [Switch.else]: (v) => `else:${v.type}`,
    });

    expect(result).toBe("else:postgres");
  });
});

// ============================================================================
// Switch.noMatch - custom runtime error
// ============================================================================

describe("Switch.noMatch - custom runtime error", () => {
  test("noMatch is not called when a case matches", () => {
    const input = makeInput({ type: "sqlite", underlying: "SELECT 1" });

    const result = Switch(input, "type", {
      duckdb: () => "d",
      sqlite: () => "s",
      txt: () => "t",
      [Switch.noMatch]: () => {
        throw new Error("should not be called");
      },
    });

    expect(result).toBe("s");
  });

  test("noMatch is called on runtime mismatch instead of default error", () => {
    const input = { type: "postgres" } as unknown as QueryEngine;

    expect(() =>
      Switch(input, "type", {
        duckdb: () => "d",
        sqlite: () => "s",
        txt: () => "t",
        [Switch.noMatch]: () => {
          throw new Error("custom: unexpected engine");
        },
      }),
    ).toThrow("custom: unexpected engine");
  });

  test("noMatch can return a value instead of throwing", () => {
    const input = { type: "postgres" } as unknown as QueryEngine;

    const result = Switch(input, "type", {
      duckdb: () => "d",
      sqlite: () => "s",
      txt: () => "t",
      [Switch.noMatch]: () => "fallback",
    });

    expect(result).toBe("fallback");
  });
});

// ============================================================================
// Error quality
// ============================================================================

describe("error quality", () => {
  test("error message includes key, actual value, and expected values", () => {
    const input = { kind: "unknown" } as unknown as
      | { kind: "a"; a: 1 }
      | { kind: "b"; b: 2 };

    try {
      Switch(input, "kind", {
        a: () => 1,
        b: () => 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(MaxError.isMaxError(err)).toBe(true);
      if (MaxError.isMaxError(err)) {
        expect(err.message).toContain("Switch(kind)");
        expect(err.message).toContain('"unknown"');
        expect(err.message).toContain("a | b");
      }
    }
  });

  test("error is an InvariantViolated MaxError", () => {
    const input = { type: "nope" } as unknown as QueryEngine;

    try {
      Switch(input, "type", {
        duckdb: () => "d",
        sqlite: () => "s",
        txt: () => "t",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(MaxError.isMaxError(err)).toBe(true);
      expect(MaxError.has(err, { kind: "marker", name: "InvariantViolated" })).toBe(true);
    }
  });
});

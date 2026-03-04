import { describe, test, expect } from "bun:test";
import { parseConnectorPackage, verifyConnectorExport } from "../verify-connector.js";
import {ConnectorModuleAny} from "../connector-module.js";

// ============================================================================
// parseConnectorPackage
// ============================================================================

describe("parseConnectorPackage", () => {
  test("parses subpath exports (exports['.'].default)", () => {
    const pkg = JSON.stringify({
      name: "@max/connector-github",
      exports: { ".": { types: "./src/index.ts", default: "./src/index.ts" } },
    });
    const result = parseConnectorPackage(pkg, "/connectors/connector-github");
    expect(result).toEqual({ name: "@max/connector-github", entryFile: "./src/index.ts" });
  });

  test("parses flat exports (exports.default)", () => {
    const pkg = JSON.stringify({
      name: "@max/connector-acme",
      exports: { types: "./src/index.ts", default: "./src/index.ts" },
    });
    const result = parseConnectorPackage(pkg, "/connectors/connector-acme");
    expect(result).toEqual({ name: "@max/connector-acme", entryFile: "./src/index.ts" });
  });

  test("falls back to main", () => {
    const pkg = JSON.stringify({
      name: "@max/connector-legacy",
      main: "./dist/index.js",
    });
    const result = parseConnectorPackage(pkg, "/connectors/connector-legacy");
    expect(result).toEqual({ name: "@max/connector-legacy", entryFile: "./dist/index.js" });
  });

  test("prefers subpath exports over flat exports", () => {
    const pkg = JSON.stringify({
      name: "@max/connector-both",
      exports: {
        ".": { default: "./src/subpath.ts" },
        default: "./src/flat.ts",
      },
    });
    const result = parseConnectorPackage(pkg, "/connectors/connector-both");
    expect(result.entryFile).toBe("./src/subpath.ts");
  });

  test("throws on invalid JSON", () => {
    expect(() => parseConnectorPackage("{not json", "/bad"))
      .toThrow("not valid JSON");
  });

  test("throws on missing name", () => {
    const pkg = JSON.stringify({ exports: { default: "./src/index.ts" } });
    expect(() => parseConnectorPackage(pkg, "/no-name"))
      .toThrow('no "name" field');
  });

  test("throws on empty name", () => {
    const pkg = JSON.stringify({ name: "", exports: { default: "./src/index.ts" } });
    expect(() => parseConnectorPackage(pkg, "/empty-name"))
      .toThrow('no "name" field');
  });

  test("throws on missing entry point", () => {
    const pkg = JSON.stringify({ name: "@max/connector-bare" });
    expect(() => parseConnectorPackage(pkg, "/bare"))
      .toThrow("no resolvable entry point");
  });

  test("throws on missing entry point when exports has no default", () => {
    const pkg = JSON.stringify({
      name: "@max/connector-types-only",
      exports: { types: "./src/index.ts" },
    });
    expect(() => parseConnectorPackage(pkg, "/types-only"))
      .toThrow("no resolvable entry point");
  });
});

// ============================================================================
// verifyConnectorExport
// ============================================================================

describe("verifyConnectorExport", () => {
  test("accepts a valid connector module", () => {

    const mod = {
      default: {
        def: { name: 'test' },
        initialise() {},
        // NOTE: The verification happening here is very thin - it's not applying any logic
        // to the actual installation object / def passed back.
        // We will want to expand on this at a later date such that the real connector mechanics
        // are smoke-tested at verification time, but I'm explicitly leaving this test as "mocked"/fake
        // as possible until we actually improve verification, because I don't want it to silently "pass" later.
        // hence: as unknown as ConnectorModuleAny
      } as unknown as ConnectorModuleAny,
    }
    const result = verifyConnectorExport(mod, "test", "/test/src/index.ts");
    expect(result).toBe(mod);
  });

  test("throws on missing default export", () => {
    expect(() => verifyConnectorExport({}, "test", "/test/src/index.ts"))
      .toThrow("missing default export");
  });

  test("throws on default export without def", () => {
    const mod = { default: { initialise() {} } };
    expect(() => verifyConnectorExport(mod, "test", "/test/src/index.ts"))
      .toThrow("must have a `def` and an `initialise` function");
  });

  test("throws on default export without initialise", () => {
    const mod = { default: { def: { name: "test" } } };
    expect(() => verifyConnectorExport(mod, "test", "/test/src/index.ts"))
      .toThrow("must have a `def` and an `initialise` function");
  });

  test("throws when initialise is not a function", () => {
    const mod = { default: { def: { name: "test" }, initialise: "not-a-fn" } };
    expect(() => verifyConnectorExport(mod, "test", "/test/src/index.ts"))
      .toThrow("must have a `def` and an `initialise` function");
  });
});

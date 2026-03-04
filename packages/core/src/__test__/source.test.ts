/**
 * Tests for Source + Derivation model.
 *
 * Verifies the core types: Source.paginated, Source.single, SourcePage,
 * derivation creation, extract, and field() for resolver compatibility.
 */

import { describe, test, expect } from "bun:test";
import { Source, SourcePage } from "../source.js";
import { EntityDef } from "../entity-def.js";
import { EntityInput } from "../entity-input.js";
import { Field } from "../field.js";
import { Context, t } from "../context-def.js";
import { PageRequest } from "../pagination.js";
import type { LoaderName } from "../loader.js";
import type { SourceName } from "../source.js";
import type { EntityId } from "../core-id-types.js";

// ============================================================================
// Test Helpers
// ============================================================================

const TestRepo = EntityDef.create("TestRepo", {
  name: Field.string(),
});

const TestIssue = EntityDef.create("TestIssue", {
  title: Field.string(),
  state: Field.string(),
});

const TestUser = EntityDef.create("TestUser", {
  login: Field.string(),
  name: Field.string(),
});

class TestContext extends Context {
  value = t.instance<string>();
}

// ============================================================================
// SourcePage
// ============================================================================

describe("SourcePage", () => {
  test("from() creates a page with data and pagination metadata", () => {
    const page = SourcePage.from({ items: [1, 2, 3] }, true, "cursor-abc");

    expect(page.data).toEqual({ items: [1, 2, 3] });
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toBe("cursor-abc");
  });

  test("from() with no more pages", () => {
    const page = SourcePage.from({ items: [] }, false);

    expect(page.data).toEqual({ items: [] });
    expect(page.hasMore).toBe(false);
    expect(page.cursor).toBeUndefined();
  });
});

// ============================================================================
// Source.paginated
// ============================================================================

describe("Source.paginated", () => {
  test("creates a source with correct properties", () => {
    const source = Source.paginated({
      name: "test:repo:issues-page" as SourceName,
      context: TestContext,
      parent: TestRepo,
      async fetch(_ref, _page, _ctx) {
        return SourcePage.from({}, false);
      },
    });

    expect(source.kind).toBe("paginated");
    expect(source.name).toBe("test:repo:issues-page");
    expect(source.parent).toBe(TestRepo);
    expect(source.context).toBe(TestContext);
    expect(source.derivations).toEqual([]);
  });

  test("fetch() delegates to the provided function", async () => {
    const source = Source.paginated({
      name: "test:issues" as SourceName,
      context: TestContext,
      parent: TestRepo,
      async fetch(ref, page, _ctx) {
        return SourcePage.from(
          { refId: ref.id, cursor: page.cursor },
          false,
        );
      },
    });

    const ref = TestRepo.ref("repo-1" as EntityId);
    const page = PageRequest.from({ cursor: "c1" });
    const ctx = Context.build(TestContext, { value: "test" });

    const result = await source.fetch(ref, page, ctx);
    expect(result.data).toEqual({ refId: "repo-1", cursor: "c1" });
    expect(result.hasMore).toBe(false);
  });
});

// ============================================================================
// Source.single
// ============================================================================

describe("Source.single", () => {
  test("creates a source with correct properties", () => {
    const source = Source.single({
      name: "test:user:detail" as SourceName,
      context: TestContext,
      parent: TestUser,
      async fetch(_ref, _ctx) {
        return { detail: true };
      },
    });

    expect(source.kind).toBe("single");
    expect(source.name).toBe("test:user:detail");
    expect(source.parent).toBe(TestUser);
    expect(source.context).toBe(TestContext);
    expect(source.derivations).toEqual([]);
  });

  test("fetch() delegates to the provided function", async () => {
    const source = Source.single({
      name: "test:user:detail" as SourceName,
      context: TestContext,
      parent: TestUser,
      async fetch(ref, _ctx) {
        return { userId: ref.id };
      },
    });

    const ref = TestUser.ref("u-1" as EntityId);
    const ctx = Context.build(TestContext, { value: "test" });

    const result = await source.fetch(ref, ctx);
    expect(result).toEqual({ userId: "u-1" });
  });
});

// ============================================================================
// Derivations
// ============================================================================

interface IssuesPageData {
  issues: Array<{ id: string; title: string; state: string }>;
  users: Array<{ id: string; login: string; name: string }>;
}

describe("source.derive()", () => {
  function makeIssuesSource() {
    return Source.paginated({
      name: "test:repo:issues-page" as SourceName,
      context: TestContext,
      parent: TestRepo,
      async fetch(_ref, _page, _ctx): Promise<SourcePage<IssuesPageData>> {
        return SourcePage.from<IssuesPageData>({ issues: [], users: [] }, false);
      },
    });
  }

  test("creates a derivation with correct properties", () => {
    const source = makeIssuesSource();
    const derivation = source.derive({
      name: "test:repo:issues" as LoaderName,
      target: TestIssue,
      extract(data) {
        return data.issues.map((i: any) =>
          EntityInput.create(TestIssue.ref(i.id), { title: i.title, state: i.state })
        );
      },
    });

    expect(derivation.kind).toBe("derivation");
    expect(derivation.name).toBe("test:repo:issues");
    expect(derivation.target).toBe(TestIssue);
    expect(derivation.parent).toBe(TestRepo);
    expect(derivation.source).toBe(source);
    expect(derivation.strategy).toBe("autoload");
    expect(derivation.dependsOn).toEqual([]);
    expect(derivation.context).toBe(TestContext);
  });

  test("registers derivation on the source", () => {
    const source = makeIssuesSource();
    expect(source.derivations).toHaveLength(0);

    const d1 = source.derive({
      name: "test:issues" as LoaderName,
      target: TestIssue,
      extract: () => [],
    });

    expect(source.derivations).toHaveLength(1);
    expect(source.derivations[0]).toBe(d1);
  });

  test("multiple derivations from the same source", () => {
    const source = makeIssuesSource();

    const d1 = source.derive({
      name: "test:issues" as LoaderName,
      target: TestIssue,
      extract: () => [],
    });

    const d2 = source.derive({
      name: "test:issue-authors" as LoaderName,
      target: TestUser,
      extract: () => [],
    });

    expect(source.derivations).toHaveLength(2);
    expect(source.derivations[0]).toBe(d1);
    expect(source.derivations[1]).toBe(d2);
  });

  test("extract() transforms source data into EntityInputs", () => {
    const source = makeIssuesSource();
    const derivation = source.derive({
      name: "test:issues" as LoaderName,
      target: TestIssue,
      extract(data) {
        return data.issues.map((i: any) =>
          EntityInput.create(TestIssue.ref(i.id), { title: i.title, state: i.state })
        );
      },
    });

    const result = derivation.extract({
      issues: [
        { id: "i-1", title: "Bug", state: "open" },
        { id: "i-2", title: "Feature", state: "closed" },
      ],
      users: [],
    });

    expect(result).toHaveLength(2);
    expect(result[0].ref.id).toBe("i-1");
    expect(result[0].fields.title).toBe("Bug");
    expect(result[1].ref.id).toBe("i-2");
    expect(result[1].fields.state).toBe("closed");
  });

  test("field() returns a valid FieldAssignment", () => {
    const source = makeIssuesSource();
    const derivation = source.derive({
      name: "test:issues" as LoaderName,
      target: TestIssue,
      extract: () => [],
    });

    const assignment = derivation.field();
    expect(assignment.loader).toBe(derivation);
    expect(assignment.sourceField).toBeUndefined();
    expect(assignment._entity).toBe(TestRepo);

    const withSource = derivation.field("issues");
    expect(withSource.sourceField).toBe("issues");
  });
});

// ============================================================================
// SingleSource derivations
// ============================================================================

describe("SingleSource derive()", () => {
  test("creates derivations on a single source", () => {
    const source = Source.single({
      name: "test:user:detail" as SourceName,
      context: TestContext,
      parent: TestUser,
      async fetch(_ref, _ctx) {
        return { name: "Alice", orgs: [{ id: "o-1", name: "Acme" }] };
      },
    });

    const derivation = source.derive({
      name: "test:user:profile" as LoaderName,
      target: TestUser,
      extract(data) {
        return [EntityInput.create(TestUser.ref("u-1" as EntityId), { name: data.name, login: "alice" })];
      },
    });

    expect(derivation.kind).toBe("derivation");
    expect(derivation.source).toBe(source);
    expect(derivation.source.kind).toBe("single");
    expect(source.derivations).toHaveLength(1);
  });
});

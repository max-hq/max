/**
 * Integration test for Source + Derivation execution.
 *
 * Verifies that a paginated source with multiple derivations populates
 * all entity types from a single API pagination pass.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  Context,
  EntityDef,
  EntityInput,
  Field,
  Fields,
  NoOpFlowController,
  Page,
  PageRequest,
  Query,
  Resolver,
  Schema,
  Seeder,
  Loader,
  SourcePage,
  Step,
  SyncPlan,
  type EntityId,
  type LoaderName,
  type SourceName,
} from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import { SyncExecutor } from "@max/execution";
import { InMemoryTaskStore } from "../in-memory-task-store.js";
import { InMemorySyncMeta } from "../in-memory-sync-meta.js";
import { DefaultTaskRunner } from "../default-task-runner.js";
import { ExecutionRegistryImpl } from "../execution-registry-impl.js";

// ============================================================================
// Test schema: Repo -> Issues + IssueAuthors (two derivations, one source)
// ============================================================================

const TestUser = EntityDef.create("TestUser", {
  login: Field.string(),
  name: Field.string(),
});

const TestIssue = EntityDef.create("TestIssue", {
  title: Field.string(),
  state: Field.string(),
  creator: Field.ref(TestUser),
});

const TestRepo = EntityDef.create("TestRepo", {
  name: Field.string(),
  issues: Field.collection(TestIssue),
  issueAuthors: Field.collection(TestUser),
});

const TestRoot = EntityDef.create("TestRoot", {
  repos: Field.collection(TestRepo),
});

const TestSchema = Schema.create({
  namespace: "test",
  entities: [TestRoot, TestRepo, TestIssue, TestUser],
  roots: [TestRoot],
});

// ============================================================================
// Test context
// ============================================================================

interface MockIssuesApi {
  listIssues(repoId: string, cursor?: string): {
    issues: Array<{
      id: string;
      title: string;
      state: string;
      creator: { id: string; login: string; name: string };
    }>;
    hasMore: boolean;
    nextCursor?: string;
  };
}

class TestContext extends Context {
  api = Context.instance<MockIssuesApi>();
}

// ============================================================================
// Source + Derivations
// ============================================================================

const IssuesPageSource = Loader.paginatedSource({
  name: "test:repo:issues-page" as SourceName,
  context: TestContext,
  parent: TestRepo,

  async fetch(ref, page, ctx) {
    const result = ctx.api.listIssues(ref.id, page.cursor);
    return SourcePage.from(result, result.hasMore, result.nextCursor);
  },
});

// Primary derivation: extract issues
const RepoIssuesLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "test:repo:issues",
  target: TestIssue,
  extract(data) {
    return data.issues.map((i) =>
      EntityInput.create(TestIssue.ref(i.id as EntityId), {
        title: i.title,
        state: i.state,
        creator: TestUser.ref(i.creator.id as EntityId),
      })
    );
  },
});

// Co-derivation: extract users discovered in issues
const IssueAuthorsLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "test:repo:issue-authors",
  target: TestUser,
  extract(data) {
    const seen = new Set<string>();
    const users: EntityInput<typeof TestUser>[] = [];
    for (const issue of data.issues) {
      if (!seen.has(issue.creator.id)) {
        seen.add(issue.creator.id);
        users.push(
          EntityInput.create(TestUser.ref(issue.creator.id as EntityId), {
            login: issue.creator.login,
            name: issue.creator.name,
          })
        );
      }
    }
    return users;
  },
});

// Standalone loaders for root and repo basics

const RootReposLoaderClean = Loader.collection({
  name: "test:root:repos",
  context: TestContext,
  entity: TestRoot,
  target: TestRepo,
  async load(_ref, _page, _ctx) {
    return Page.from(
      [EntityInput.create(TestRepo.ref("repo-1" as EntityId), { name: "my-repo" })],
      false,
    );
  },
});

const RepoBasicLoader = Loader.entity({
  name: "test:repo:basic",
  context: TestContext,
  entity: TestRepo,
  async load(ref, _ctx) {
    return EntityInput.create(ref, { name: "my-repo" });
  },
});

// Canonical user loader (fallback, not used in this test's sync plan)
const UserBasicLoader = Loader.entity({
  name: "test:user:basic",
  context: TestContext,
  entity: TestUser,
  async load(ref, _ctx) {
    return EntityInput.create(ref, { login: "unknown", name: "Unknown" });
  },
});

// Issue basic loader (fallback)
const IssueBasicLoader = Loader.entity({
  name: "test:issue:basic",
  context: TestContext,
  entity: TestIssue,
  async load(ref, _ctx) {
    return EntityInput.create(ref, { title: "unknown", state: "unknown" });
  },
});

// ============================================================================
// Resolvers
// ============================================================================

const TestRootResolver = Resolver.for(TestRoot, {
  repos: RootReposLoaderClean.field(),
});

const TestRepoResolver = Resolver.for(TestRepo, {
  name: RepoBasicLoader.field("name"),
  issues: RepoIssuesLoader.field(),
  issueAuthors: IssueAuthorsLoader.field(),
});

const TestIssueResolver = Resolver.for(TestIssue, {
  title: IssueBasicLoader.field("title"),
  state: IssueBasicLoader.field("state"),
  creator: IssueBasicLoader.field("creator"),
});

const TestUserResolver = Resolver.for(TestUser, {
  login: UserBasicLoader.field("login"),
  name: UserBasicLoader.field("name"),
});

// ============================================================================
// Test seeder
// ============================================================================

const TestSeeder = Seeder.create({
  context: TestContext,
  async seed(_ctx, engine) {
    const rootRef = TestRoot.ref("root" as EntityId);
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      Step.forRoot(rootRef).loadCollection("repos"),
      Step.forAll(TestRepo).loadFields("name"),
      Step.forAll(TestRepo).loadCollection("issues"),
      // No explicit issueAuthors step - co-derivation handles it
    ]);
  },
});

// ============================================================================
// Mock API
// ============================================================================

function createMockApi(opts?: { paginate?: boolean }): MockIssuesApi {
  const allIssues = [
    { id: "i-1", title: "Bug report", state: "open", creator: { id: "u-alice", login: "alice", name: "Alice" } },
    { id: "i-2", title: "Feature request", state: "open", creator: { id: "u-bob", login: "bob", name: "Bob" } },
    { id: "i-3", title: "Fix typo", state: "closed", creator: { id: "u-alice", login: "alice", name: "Alice" } },
    { id: "i-4", title: "Add tests", state: "open", creator: { id: "u-charlie", login: "charlie", name: "Charlie" } },
  ];

  return {
    listIssues(_repoId: string, cursor?: string) {
      if (!opts?.paginate) {
        return { issues: allIssues, hasMore: false };
      }

      // Paginate: 2 items per page
      const startIdx = cursor ? parseInt(cursor, 10) : 0;
      const pageSize = 2;
      const pageItems = allIssues.slice(startIdx, startIdx + pageSize);
      const nextIdx = startIdx + pageSize;
      const hasMore = nextIdx < allIssues.length;

      return {
        issues: pageItems,
        hasMore,
        nextCursor: hasMore ? String(nextIdx) : undefined,
      };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Source + Derivation E2E", () => {
  let db: Database;
  let engine: SqliteEngine;
  let syncMeta: InMemorySyncMeta;

  beforeEach(() => {
    db = new Database(":memory:");
    const schema = new SqliteSchema().registerSchema(TestSchema);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);
    syncMeta = new InMemorySyncMeta();
  });

  function createExecutor(api: MockIssuesApi) {
    const registry = new ExecutionRegistryImpl([
      TestRootResolver,
      TestRepoResolver,
      TestIssueResolver,
      TestUserResolver,
    ]);
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: async () => Context.build(TestContext, { api }),
    });
    return new SyncExecutor({
      taskRunner,
      taskStore: new InMemoryTaskStore(),
    });
  }

  async function seedAndRun(executor: SyncExecutor, api: MockIssuesApi) {
    const ctx = Context.build(TestContext, { api });
    const plan = await TestSeeder.seed(ctx, engine);
    return executor.execute(plan);
  }

  test("co-derivation populates both issues and users from one source", async () => {
    const api = createMockApi();
    const executor = createExecutor(api);

    const handle = await seedAndRun(executor, api);
    const result = await handle.completion();

    expect(result.status).toBe("completed");
    expect(result.tasksFailed).toBe(0);

    // Issues should be populated
    const issues = await engine.query(Query.from(TestIssue).selectAll());
    expect(issues.items.length).toBe(4);

    const bug = await engine.load(TestIssue.ref("i-1" as EntityId), Fields.ALL);
    expect(bug.fields.title).toBe("Bug report");
    expect(bug.fields.state).toBe("open");

    // Users should be populated by co-derivation (no explicit sync step!)
    const users = await engine.query(Query.from(TestUser).selectAll());
    expect(users.items.length).toBe(3); // alice, bob, charlie (alice deduped)

    const alice = await engine.load(TestUser.ref("u-alice" as EntityId), Fields.ALL);
    expect(alice.fields.login).toBe("alice");
    expect(alice.fields.name).toBe("Alice");

    const bob = await engine.load(TestUser.ref("u-bob" as EntityId), Fields.ALL);
    expect(bob.fields.login).toBe("bob");

    const charlie = await engine.load(TestUser.ref("u-charlie" as EntityId), Fields.ALL);
    expect(charlie.fields.name).toBe("Charlie");
  });

  test("pagination: source paginates and all derivations run on each page", async () => {
    const api = createMockApi({ paginate: true });
    const executor = createExecutor(api);

    const handle = await seedAndRun(executor, api);
    const result = await handle.completion();

    expect(result.status).toBe("completed");
    expect(result.tasksFailed).toBe(0);

    // All 4 issues across 2 pages
    const issues = await engine.query(Query.from(TestIssue).selectAll());
    expect(issues.items.length).toBe(4);

    // All 3 unique users across 2 pages
    const users = await engine.query(Query.from(TestUser).selectAll());
    expect(users.items.length).toBe(3);
  });
});

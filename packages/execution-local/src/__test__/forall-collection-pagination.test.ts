/**
 * Regression test: forAll().loadCollection() must process ALL pages of refs.
 *
 * With refPageSize=2 and 3 workspaces, the forAll step paginates into two
 * pages. Before the fix, only page 1's workspaces got load-collection tasks
 * spawned — page 2's continuation was dispatched as a load-fields no-op,
 * silently dropping the 3rd workspace's users.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Context, Fields, NoOpFlowController, Query } from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import AcmeConnector, {
  AcmeRoot,
  AcmeUser,
  AcmeWorkspace,
  AcmeAppContext,
  AcmeSeeder,
  AcmeSchema,
} from "@max/connector-acme";
import { SyncExecutor } from "@max/execution";
import { InMemoryTaskStore } from "../in-memory-task-store.js";
import { InMemorySyncMeta } from "../in-memory-sync-meta.js";
import { DefaultTaskRunner } from "../default-task-runner.js";
import { ExecutionRegistryImpl } from "../execution-registry-impl.js";

// ============================================================================
// Mock API — 3 workspaces, each with distinct users
// ============================================================================

interface MockHttpClient {
  listWorkspaces(): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string }>>;
  getWorkspace(id: string): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }>;
  listUsers(workspaceId?: string): Promise<Array<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>>;
  getUser(id: string): Promise<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>;
  listProjects(workspaceId?: string): Promise<Array<{ id: string; name: string; description: string | null; status: string; ownerId: string; workspaceId: string; createdAt: string; updatedAt: string }>>;
}

interface MockAcmeClient {
  client: MockHttpClient;
}

const workspaces = [
  { id: "ws1", name: "Alpha" },
  { id: "ws2", name: "Beta" },
  { id: "ws3", name: "Gamma" },
];

const usersByWorkspace: Record<string, Array<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string }>> = {
  ws1: [
    { id: "u1", displayName: "Alice", email: "alice@acme.com", role: "admin", active: true, workspaceId: "ws1" },
  ],
  ws2: [
    { id: "u2", displayName: "Bob", email: "bob@acme.com", role: "member", active: true, workspaceId: "ws2" },
  ],
  ws3: [
    { id: "u3", displayName: "Charlie", email: "charlie@acme.com", role: "member", active: true, workspaceId: "ws3" },
  ],
};

const allUsers = Object.values(usersByWorkspace).flat();

function createMockApi(): MockAcmeClient {
  return {
    client: {
      async listWorkspaces() {
        return workspaces.map((ws) => ({ ...ws, createdAt: "", updatedAt: "" }));
      },
      async getWorkspace(id: string) {
        const ws = workspaces.find((w) => w.id === id);
        if (!ws) throw new Error(`Workspace not found: ${id}`);
        return { ...ws, createdAt: "", updatedAt: "" };
      },
      async listUsers(workspaceId?: string) {
        const users = workspaceId ? (usersByWorkspace[workspaceId] ?? []) : allUsers;
        return users.map((u) => ({ ...u, createdAt: "", updatedAt: "" }));
      },
      async getUser(id: string) {
        const user = allUsers.find((u) => u.id === id);
        if (!user) throw new Error(`User not found: ${id}`);
        return { ...user, createdAt: "", updatedAt: "" };
      },
      async listProjects(_workspaceId?: string) {
        return [];
      },
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createContextProvider(api: MockAcmeClient) {
  return async () =>
    Context.build(AcmeAppContext, {
      api: api as any,
      workspaceId: "ws1",
    });
}

// ============================================================================
// Tests
// ============================================================================

describe("forAll loadCollection pagination", () => {
  let db: Database;
  let engine: SqliteEngine;
  let mockApi: MockAcmeClient;

  beforeEach(() => {
    db = new Database(":memory:");
    const schema = new SqliteSchema().registerSchema(AcmeSchema);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);
    mockApi = createMockApi();
  });

  test("forAll().loadCollection() loads collections for entities on ALL pages", async () => {
    const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta: new InMemorySyncMeta(),
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: createContextProvider(mockApi),
      // refPageSize=2 means 3 workspaces span 2 pages
      tuning: { refPageSize: 2 },
    });
    const executor = new SyncExecutor({
      taskRunner,
      taskStore: new InMemoryTaskStore(),
    });

    const ctx = await createContextProvider(mockApi)();
    const plan = await AcmeSeeder.seed(ctx as any, engine);
    const handle = await executor.execute(plan);
    const result = await handle.completion();

    expect(result.status).toBe("completed");

    // All 3 workspaces should exist
    const wsResult = await engine.query(Query.from(AcmeWorkspace).selectAll());
    expect(wsResult.items.length).toBe(3);

    // All 3 users should exist — one from each workspace.
    // Before the fix, only users from the first 2 workspaces (page 1) are stored.
    const userResult = await engine.query(Query.from(AcmeUser).selectAll());
    expect(userResult.items.length).toBe(3);

    const alice = await engine.load(AcmeUser.ref("u1"), Fields.ALL);
    expect(alice.fields.displayName).toBe("Alice");

    const bob = await engine.load(AcmeUser.ref("u2"), Fields.ALL);
    expect(bob.fields.displayName).toBe("Bob");

    // Charlie is on the 3rd workspace (page 2) — this fails without the fix
    const charlie = await engine.load(AcmeUser.ref("u3"), Fields.ALL);
    expect(charlie.fields.displayName).toBe("Charlie");
  });
});

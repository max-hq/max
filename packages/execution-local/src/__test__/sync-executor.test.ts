/**
 * E2E test for the sync execution layer.
 *
 * Tests: seed -> sync -> verify stored data
 * Uses real SqliteEngine, InMemoryTaskStore, InMemorySyncMeta.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { BasicLoaderEnv, Context, Env, Fields, NoOpFlowController, Query } from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import AcmeConnector, {
  AcmeUser,
  AcmeWorkspace,
  AcmeAppContext,
  AcmeSeeder,
  AcmeSchema,
} from "@max/connector-acme";
import { AcmeTestClient } from "@max/acme";
import { SyncExecutor } from "@max/execution";
import { InMemoryTaskStore } from "../in-memory-task-store.js";
import { InMemorySyncMeta } from "../in-memory-sync-meta.js";
import { DefaultTaskRunner } from "../default-task-runner.js";
import { ExecutionRegistryImpl } from "../execution-registry-impl.js";

describe("SyncExecutor E2E", () => {
  let db: Database;
  let engine: SqliteEngine;
  let syncMeta: InMemorySyncMeta;
  let taskStore: InMemoryTaskStore;
  let testClient: AcmeTestClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    const schema = new SqliteSchema().registerSchema(AcmeSchema);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);

    syncMeta = new InMemorySyncMeta();
    taskStore = new InMemoryTaskStore();

    testClient = new AcmeTestClient();
    await testClient.seed({
      workspaces: 1,
      usersPerWorkspace: 3,
      projectsPerWorkspace: 0,
      tasksPerProject: 0,
      filesPerProject: 0,
    });
  });

  afterEach(() => {
    testClient.dispose();
  });

  function buildCtx() {
    return Context.build(AcmeAppContext, {
      api: { client: testClient },
      workspaceId: "any",
    });
  }

  function createExecutor(store: InMemoryTaskStore = taskStore) {
    const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
    const env = new BasicLoaderEnv(buildCtx());
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      env,
    });
    return new SyncExecutor({ taskRunner, taskStore: store });
  }

  async function seedAndExecute(executor: SyncExecutor) {
    const plan = await AcmeSeeder.seed(Env.seeder({ ctx: buildCtx(), engine }));
    return executor.execute(plan);
  }

  test("seed -> sync -> data is in SQLite", async () => {
    const executor = createExecutor();
    const handle = await seedAndExecute(executor);
    const result = await handle.completion();

    expect(result.status).toBe("completed");

    // Verify all seeded users are synced into SQLite
    const seededUsers = await testClient.listUsers();
    const storedUsers = await engine.query(Query.from(AcmeUser).selectAll());
    expect(storedUsers.items.length).toBe(seededUsers.length);

    // Verify field data matches the API
    const firstUser = seededUsers[0];
    const stored = await engine.load(AcmeUser.ref(firstUser.id), Fields.ALL);
    expect(stored.fields.displayName).toBe(firstUser.displayName);
    expect(stored.fields.email).toBe(firstUser.email);
  });

  test("second sync re-processes entities (no staleness check yet)", async () => {
    const executor = createExecutor();
    const handle1 = await seedAndExecute(executor);
    await handle1.completion();

    // Second sync with fresh task store
    const executor2 = createExecutor(new InMemoryTaskStore());
    const handle2 = await seedAndExecute(executor2);
    await handle2.completion();

    const seededUsers = await testClient.listUsers();
    const storedUsers = await engine.query(Query.from(AcmeUser).selectAll());
    expect(storedUsers.items.length).toBe(seededUsers.length);
  });

  test("SyncHandle: can check status", async () => {
    const executor = createExecutor();
    const handle = await seedAndExecute(executor);

    const listed = await executor.syncs.list();
    expect(listed.length).toBeGreaterThanOrEqual(1);

    const found = await executor.syncs.get(handle.id);
    expect(found).not.toBeNull();

    const result = await handle.completion();
    expect(result.status).toBe("completed");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  test("sync completes (not hangs) when a loader throws", async () => {
    testClient.getWorkspace = async () => {
      throw new Error("API unavailable");
    };

    const executor = createExecutor();
    const handle = await seedAndExecute(executor);

    const result = await Promise.race([
      handle.completion(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2000)),
    ]);

    expect(result).not.toBe("timeout");
    if (result === "timeout") return;
    expect(result.tasksFailed).toBeGreaterThan(0);
  });

  test("sync completes (not hangs) when a child task throws", async () => {
    testClient.listUsers = async () => {
      throw new Error("Users API unavailable");
    };

    const executor = createExecutor();
    const handle = await seedAndExecute(executor);

    const result = await Promise.race([
      handle.completion(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2000)),
    ]);

    expect(result).not.toBe("timeout");
    if (result === "timeout") return;
    expect(result.tasksFailed).toBeGreaterThan(0);
  });
});

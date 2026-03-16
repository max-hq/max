/**
 * Regression test: forAll().loadCollection() must process ALL pages of refs.
 *
 * With refPageSize=2 and 3 workspaces, the forAll step paginates into two
 * pages. Before the fix, only page 1's workspaces got load-collection tasks
 * spawned - page 2's continuation was dispatched as a load-fields no-op,
 * silently dropping the 3rd workspace's projects.
 */

import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import {Database} from "bun:sqlite";
import {BasicLoaderEnv, Context, Env, Query} from "@max/core";
import {SqliteEngine, SqliteSchema} from "@max/storage-sqlite";
import AcmeConnector, {AcmeAppContext, AcmeProject, AcmeSchema, AcmeSeeder, AcmeWorkspace,} from "@max/connector-acme";
import {AcmeTestClient} from "@max/acme";
import {SyncExecutor} from "@max/execution";
import {InMemoryTaskStore} from "../in-memory-task-store.js";
import {InMemorySyncMeta} from "../in-memory-sync-meta.js";
import {DefaultTaskRunner} from "../default-task-runner.js";
import {ExecutionRegistryImpl} from "../execution-registry-impl.js";

describe("forAll loadCollection pagination", () => {
  let db: Database;
  let engine: SqliteEngine;
  let testClient: AcmeTestClient;

  beforeEach(() => {
    db = new Database(":memory:");
    const schema = new SqliteSchema().registerSchema(AcmeSchema);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);

    testClient = AcmeTestClient.withData({
      workspaces: [
        { name: "Alpha", users: [{ displayName: "Alice" }], projects: [{ name: "Alpha Project" }] },
        { name: "Beta", users: [{ displayName: "Bob" }], projects: [{ name: "Beta Project" }] },
        { name: "Gamma", users: [{ displayName: "Charlie" }], projects: [{ name: "Gamma Project" }] },
      ],
    });
  });

  afterEach(() => {
    testClient.dispose();
  });

  test("forAll().loadCollection() loads collections for entities on ALL pages", async () => {
    const ctx = Context.build(AcmeAppContext, {
      api: { client: testClient },
      workspaceId: "any",
    });

    const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta: new InMemorySyncMeta(),
      registry,
      env: new BasicLoaderEnv(ctx),
      // refPageSize=2 means 3 workspaces span 2 pages
      tuning: { refPageSize: 2 },
    });
    const executor = new SyncExecutor({
      taskRunner,
      taskStore: new InMemoryTaskStore(),
    });

    const plan = await AcmeSeeder.seed(Env.seeder({ ctx, engine }));
    const handle = await executor.execute(plan);
    const result = await handle.completion();

    expect(result.status).toBe("completed");

    // All 3 workspaces should exist
    const wsResult = await engine.query(Query.from(AcmeWorkspace).selectAll());
    expect(wsResult.items.length).toBe(3);

    // All 3 projects should exist - one from each workspace.
    const projectResult = await engine.query(Query.from(AcmeProject).selectAll());
    expect(projectResult.items.length).toBe(3);
  });
});

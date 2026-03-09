/**
 * Benchmark: Max entity write throughput.
 *
 * Seeds an in-memory ACME tenant with 50,000 tasks, then syncs them
 * through the full Max execution pipeline into both an in-memory and
 * a disc-backed SQLite engine.
 *
 * Usage: bun run examples/src/benchmark-write-throughput.ts
 */

import { Context, NoOpFlowController } from "@max/core";
import { SqliteEngine } from "@max/storage-sqlite";
import {
  SqliteExecutionSchema,
  SqliteSyncMeta,
  SqliteTaskStore,
} from "@max/execution-sqlite";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import { SyncExecutor } from "@max/execution";
import AcmeConnector, {
  AcmeAppContext,
  AcmeSchema,
  AcmeSeeder,
} from "@max/connector-acme";
import { AcmeTestClient } from "@max/acme";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const NUM_PROJECTS = 50;
const TASKS_PER_PROJECT = 1_000; // 50 × 1,000 = 50,000 tasks
const NUM_USERS = 10;
const TOTAL_TASKS = NUM_PROJECTS * TASKS_PER_PROJECT;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupEngine(dbPath: string) {
  const engine = SqliteEngine.open(dbPath, AcmeSchema);
  const db = engine.db;
  SqliteExecutionSchema.ensureTables(db);

  return {
    db,
    engine,
    syncMeta: new SqliteSyncMeta(db),
    taskStore: new SqliteTaskStore(db),
  };
}

async function runSync(label: string, api: AcmeTestClient, dbPath: string, workspaceId: string) {
  console.log(`\n--- ${label} ---`);
  const { db, engine, syncMeta, taskStore } = setupEngine(dbPath);

  // Resolvers access ctx.api.client.* - AcmeTestClient implements AcmeClient,
  // so { client: api } satisfies AcmeClientProvider
  const clientProvider = { client: api };

  const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
  const taskRunner = new DefaultTaskRunner({
    engine,
    syncMeta,
    registry,
    flowController: new NoOpFlowController(),
    contextProvider: async () =>
      Context.build(AcmeAppContext, {
        api: clientProvider,
        workspaceId,
      }),
  });
  const executor = new SyncExecutor({ taskRunner, taskStore });

  // Build the sync plan (seeds root entities, returns step graph)
  const ctx = await Context.build(AcmeAppContext, {
    api: clientProvider,
    workspaceId,
  });
  const plan = await AcmeSeeder.seed(ctx, engine);
  console.log(`  Plan: ${plan.steps.length} steps`);

  // ---- timed section ----
  const start = performance.now();
  const handle = await executor.execute(plan);
  const result = await handle.completion();
  const elapsed = performance.now() - start;

  // Count stored entities
  const count = (table: string): number =>
    (db.query(`SELECT COUNT(*) as n FROM "${table}"`).get() as any)?.n ?? 0;

  const tasks = count("_acme_task");
  const users = count("_acme_user");
  const projects = count("_acme_project");
  const workspaces = count("_acme_workspace");
  const total = tasks + users + projects + workspaces;

  console.log(`  Status:       ${result.status}`);
  console.log(`  Duration:     ${elapsed.toFixed(0)}ms`);
  console.log(`  Tasks:        ${tasks}`);
  console.log(`  Users:        ${users}`);
  console.log(`  Projects:     ${projects}`);
  console.log(`  Workspaces:   ${workspaces}`);
  console.log(`  Total:        ${total} entities`);
  console.log(
    `  Throughput:   ${(total / (elapsed / 1000)).toFixed(0)} entities/sec`
  );
  console.log(
    `  Task writes:  ${(tasks / (elapsed / 1000)).toFixed(0)} tasks/sec`
  );

  db.close();
  return { elapsed, tasks, total };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("=== Max Write Throughput Benchmark ===");
console.log(
  `Target: ${TOTAL_TASKS.toLocaleString()} tasks (${NUM_PROJECTS} projects × ${TASKS_PER_PROJECT} tasks/project)\n`
);

// 1. Seed the in-memory ACME tenant
console.log("Seeding ACME tenant...");
const seedStart = performance.now();
const api = new AcmeTestClient({});
await api.seed({
  workspaces: 1,
  usersPerWorkspace: NUM_USERS,
  projectsPerWorkspace: NUM_PROJECTS,
  tasksPerProject: TASKS_PER_PROJECT,
  filesPerProject: 0,
});
const seedElapsed = performance.now() - seedStart;
console.log(`  Done in ${seedElapsed.toFixed(0)}ms`);

// Grab the workspace ID the seeder created
const workspaceId = api.tenant.listWorkspaces()[0].id;

// 2. Benchmark: in-memory SQLite
const memResult = await runSync("In-Memory SQLite", api, ":memory:", workspaceId);

// 3. Benchmark: disc-backed SQLite
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "max-bench-"));
const dbFile = path.join(tmpDir, "bench.db");
const discResult = await runSync("Disc-Backed SQLite", api, dbFile, workspaceId);

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
api.dispose();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n=== Summary ===");
console.log(
  `  In-memory:    ${memResult.elapsed.toFixed(0)}ms  (${(memResult.total / (memResult.elapsed / 1000)).toFixed(0)} entities/sec)`
);
console.log(
  `  Disc-backed:  ${discResult.elapsed.toFixed(0)}ms  (${(discResult.total / (discResult.elapsed / 1000)).toFixed(0)} entities/sec)`
);
console.log(
  `  Disc overhead: ${(discResult.elapsed / memResult.elapsed).toFixed(2)}x`
);

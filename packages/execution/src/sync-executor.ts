/**
 * SyncExecutor - The orchestrator for sync operations.
 *
 * Dependency-driven task execution:
 *   1. Expand SyncPlan into a full task graph (all tasks registered upfront)
 *   2. Worker pool drain loop: claim -> execute -> complete -> unblock dependents
 *   3. When a task spawns children, it moves to awaiting_children
 *   4. When all children complete, parent completes (iteratively unblocking)
 *   5. When no active tasks remain, sync is done
 *
 * The executor is abstract - it delegates actual task execution to a
 * TaskRunner. Loader dispatch, engine.store, and syncMeta bookkeeping
 * all live in the runner, not here.
 *
 * Concurrency is controlled at two layers:
 * - Task-level: FlowController gates how many tasks run in parallel
 * - Operation-level: Limit on Operation, enforced by middleware (not here)
 *
 * This model survives restarts - all state is in the task store.
 */

import { type FlowController, Lifecycle, LifecycleManager, type SyncPlan, type EntityType } from '@max/core'

import type {Task, TaskId, TaskPayload} from "./task.js";
import type {TaskStore} from "./task-store.js";
import type {TaskRunner, TaskRunResult} from "./task-runner.js";
import type {SyncHandle, SyncResult, SyncStatus, SyncRegistry, SyncId} from "./sync-handle.js";
import type {SyncStore} from "./sync-store.js";
import type {SyncObserver, SyncProgressEvent} from "./sync-observer.js";
import {PlanExpander} from "./plan-expander.js";
import {Signal} from "./signal.js";
import {SemaphoreFlowController} from "./semaphore-flow-controller.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TASK_CONCURRENCY = 50;

// ============================================================================
// Config
// ============================================================================

export interface SyncExecutorConfig {
  taskRunner: TaskRunner;
  taskStore: TaskStore;
  syncStore: SyncStore;
  /** Task-level concurrency gate. Default: SemaphoreFlowController(50). */
  flowController?: FlowController;
}

// ============================================================================
// SyncExecutor
// ============================================================================

export class SyncExecutor implements Lifecycle {


  // FIXME: We need to propagate lifecycle onto these dependencies.
  // They're not currently lifecycle aware
  lifecycle = LifecycleManager.auto(() => [])

  private taskRunner: TaskRunner;
  private taskStore: TaskStore;
  readonly syncStore: SyncStore;
  private flowController: FlowController;
  private expander: PlanExpander;

  private activeSyncs = new Map<SyncId, SyncHandleImpl>();

  readonly syncs: SyncRegistry;

  // Workers are lightweight async functions - idle workers cost nothing.
  // The FlowController is the actual concurrency bottleneck.
  private static WORKER_POOL_SIZE = 64;

  constructor(config: SyncExecutorConfig) {
    this.taskRunner = config.taskRunner;
    this.taskStore = config.taskStore;
    this.syncStore = config.syncStore;
    this.flowController = config.flowController ?? new SemaphoreFlowController(DEFAULT_TASK_CONCURRENCY);
    this.expander = new PlanExpander();

    this.syncs = new SyncRegistryImpl(this.activeSyncs);
  }

  /** Execute a sync plan. Returns a handle immediately. */
  execute(plan: SyncPlan, options?: { syncId?: SyncId; observer?: SyncObserver }): SyncHandle {
    const syncId = options?.syncId ?? this.syncStore.nextId();
    const handle = new SyncHandleImpl(syncId, options?.observer);
    this.activeSyncs.set(syncId, handle);

    this.runSync(handle, plan).catch((err) => {
      handle.markFailed(err);
      this.syncStore.setStatus(handle.id, "failed");
    });

    return handle;
  }

  /** Resume a previously interrupted sync. Skips seeding — drains existing tasks. */
  resume(syncId: SyncId, options?: { observer?: SyncObserver }): SyncHandle {
    const handle = new SyncHandleImpl(syncId, options?.observer);
    this.activeSyncs.set(syncId, handle);

    this.resumeSync(handle).catch((err) => {
      handle.markFailed(err);
      this.syncStore.setStatus(handle.id, "failed");
    });

    return handle;
  }

  // ============================================================================
  // Sync lifecycle
  // ============================================================================

  private async runSync(handle: SyncHandleImpl, plan: SyncPlan): Promise<void> {
    // Record sync in persistent store
    await this.syncStore.create(handle.id);

    // 1. Expand full plan into task graph
    const templates = this.expander.expandPlan(plan, handle.id);

    handle.emit({ kind: "sync-started", stepCount: templates.length });

    // 2. Enqueue all tasks with dependency resolution
    await this.taskStore.enqueueGraph(templates);

    // 3. Concurrent drain loop
    await this.drainTasks(handle);

    if (!handle.isDone()) {
      handle.markCompleted(handle.tasksCompleted, handle.tasksFailed);
      await this.syncStore.setStatus(handle.id, "completed");
    }
  }

  private async resumeSync(handle: SyncHandleImpl): Promise<void> {
    await this.syncStore.setStatus(handle.id, "running");

    handle.emit({ kind: "sync-started", stepCount: 0 });

    await this.drainTasks(handle);

    if (!handle.isDone()) {
      handle.markCompleted(handle.tasksCompleted, handle.tasksFailed);
      await this.syncStore.setStatus(handle.id, "completed");
    }
  }

  private async drainTasks(handle: SyncHandleImpl): Promise<void> {
    const workers = Array.from(
      { length: SyncExecutor.WORKER_POOL_SIZE },
      () => this.workerLoop(handle),
    );
    await Promise.all(workers);
  }

  private async workerLoop(handle: SyncHandleImpl): Promise<void> {
    while (!handle.isDone()) {
      if (handle.isPaused()) {
        await handle.workSignal.wait();
        continue;
      }

      const task = await this.taskStore.claim(handle.id);
      if (!task) {
        if (!await this.taskStore.hasActiveTasks(handle.id)) break;
        await handle.workSignal.wait();
        continue;
      }

      // FlowController gates actual execution
      await this.flowController.run(async () => {
        try {
          const result = await this.executeTask(task);
          const hasChildren = (result.children?.length ?? 0) > 0;

          if (hasChildren) {
            await this.taskStore.setAwaitingChildren(task.id);
            handle.workSignal.notifyAll(); // Wake workers - new tasks available
          } else {
            const completed = await this.taskStore.complete(task.id);
            handle.tasksCompleted++;
            emitTaskCompleted(handle, task.payload);
            await this.onTaskCompleted(completed, handle);
            handle.workSignal.notifyAll(); // Wake workers - dependents may be unblocked
          }

          // Emit progress from inline work (e.g. batch field loading)
          if (result.progress) {
            handle.emit({
              kind: "task-completed",
              entityType: result.progress.entityType,
              operation: result.progress.operation,
              count: result.progress.count,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.taskStore.fail(task.id, message);
          handle.tasksFailed++;
          emitTaskFailed(handle, task.payload, message);
          handle.workSignal.notifyAll(); // Wake workers - failed task may have been the last active
        }
      });
    }
  }

  /**
   * After a task completes:
   * 1. Unblock any tasks waiting on this one (blockedBy = this task)
   * 2. If this task has a parent, check if all siblings are done
   *    -> if so, complete the parent (iteratively up the chain)
   */
  private async onTaskCompleted(task: Task, handle: SyncHandleImpl): Promise<void> {
    let current: Task | undefined = task;

    while (current) {
      await this.taskStore.unblockDependents(current.id);

      if (!current.parentId) break;

      const allDone = await this.taskStore.allChildrenComplete(current.parentId);
      if (!allDone) break;

      current = await this.taskStore.complete(current.parentId);
    }
  }

  // ============================================================================
  // Task execution - delegates to TaskRunner
  // ============================================================================

  private async executeTask(task: Task): Promise<TaskRunResult> {
    const result = await this.taskRunner.execute(task);

    if (result.children?.length) {
      for (const child of result.children) {
        await this.taskStore.enqueue({
          syncId: task.syncId,
          state: child.state,
          parentId: task.id,
          payload: child.payload,
        });
      }
    }

    return result;
  }

}

// ============================================================================
// SyncHandle Implementation
// ============================================================================

class SyncHandleImpl implements SyncHandle {
  readonly startedAt = new Date();
  private _status: SyncStatus = "running";
  private resolveCompletion!: (result: SyncResult) => void;
  private completionPromise: Promise<SyncResult>;
  private observer?: SyncObserver;

  /** Signal for waking worker loops when new work is available. */
  readonly workSignal = new Signal();

  tasksCompleted = 0;
  tasksFailed = 0;

  constructor(
    readonly id: SyncId,
    observer?: SyncObserver,
  ) {
    this.observer = observer;
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  emit(event: SyncProgressEvent): void {
    this.observer?.onEvent(event);
  }

  async status(): Promise<SyncStatus> { return this._status; }
  isPaused(): boolean { return this._status === "paused"; }
  async pause(): Promise<void> { this._status = "paused"; }
  async resume(): Promise<void> {
    if (this._status === "paused") {
      this._status = "running";
      this.workSignal.notifyAll();
    }
  }
  async cancel(): Promise<void> {
    this._status = "cancelled";
    this.resolveCompletion(this.buildResult());
  }
  completion(): Promise<SyncResult> { return this.completionPromise; }
  isDone(): boolean {
    return this._status === "completed" || this._status === "failed" || this._status === "cancelled";
  }

  markCompleted(completed: number, failed: number): void {
    this.tasksCompleted = completed;
    this.tasksFailed = failed;
    this._status = "completed";
    const result = this.buildResult();
    this.emit({ kind: "sync-completed", result });
    this.resolveCompletion(result);
  }

  markFailed(err: unknown): void {
    this._status = "failed";
    const result = this.buildResult();
    this.emit({ kind: "sync-completed", result });
    this.resolveCompletion(result);
  }

  private buildResult(): SyncResult {
    return {
      status: this._status,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      duration: Date.now() - this.startedAt.getTime(),
    };
  }
}

// ============================================================================
// SyncRegistry Implementation
// ============================================================================

class SyncRegistryImpl implements SyncRegistry {
  constructor(private syncs: Map<SyncId, SyncHandleImpl>) {}
  async list(): Promise<SyncHandle[]> { return Array.from(this.syncs.values()); }
  async get(id: SyncId): Promise<SyncHandle | null> { return this.syncs.get(id) ?? null; }
  async findDuplicate(syncId: SyncId): Promise<SyncHandle | null> { return this.syncs.get(syncId) ?? null; }
}

// ============================================================================
// Progress event helpers
// ============================================================================

/** Only leaf tasks that call loaders are worth reporting. */
function isProgressWorthy(payload: TaskPayload): payload is TaskPayload & { kind: "load-fields" | "load-collection" } {
  return payload.kind === "load-fields" || payload.kind === "load-collection";
}

function resolveEntityType(payload: TaskPayload & { kind: "load-fields" | "load-collection" }): EntityType {
  if (payload.kind === "load-collection" && payload.targetEntityType) {
    return payload.targetEntityType;
  }
  return payload.entityType;
}

function emitTaskCompleted(handle: SyncHandleImpl, payload: TaskPayload): void {
  if (isProgressWorthy(payload)) {
    handle.emit({
      kind: "task-completed",
      entityType: resolveEntityType(payload),
      operation: payload.kind,
    });
  }
}

function emitTaskFailed(handle: SyncHandleImpl, payload: TaskPayload, error: string): void {
  if (isProgressWorthy(payload)) {
    handle.emit({
      kind: "task-failed",
      entityType: resolveEntityType(payload),
      operation: payload.kind,
      error,
    });
  }
}


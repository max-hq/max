/**
 * @max/execution - Execution layer for Max sync operations.
 */

// Task types
export type {
  TaskId,
  TaskState,
  TaskPayload,
  LoadFieldsPayload,
  LoadCollectionPayload,
  SyncStepPayload,
  SyncGroupPayload,
  SerialisedStepTarget,
  ForAllTarget,
  ForRootTarget,
  ForOneTarget,
  SerialisedStepOperation,
  Task,
} from "./task.js";

// TaskStore
export type { TaskStore, TaskTemplate } from "./task-store.js";

// TaskRunner
export type { TaskRunner, TaskRunResult, TaskChildTemplate, TaskProgress } from "./task-runner.js";

// SyncQueryEngine
export type { SyncQueryEngine } from "./sync-query-engine.js";

// SyncHandle
export type {
  SyncId,
  SyncStatus,
  SyncResult,
  SyncHandle,
  SyncRegistry,
} from "./sync-handle.js";

// FIXME: we should pull this into @max/execution
export { SyncPlan } from '@max/core'

// Registry
export type { ExecutionRegistry } from "./registry.js";

// PlanExpander
export { PlanExpander } from "./plan-expander.js";

// SyncExecutor
export { SyncExecutor } from "./sync-executor.js";
export type { SyncExecutorConfig } from "./sync-executor.js";

// SyncObserver
export type { SyncObserver, SyncProgressEvent } from "./sync-observer.js";

// Concurrency primitives
export { Semaphore } from "./semaphore.js";
export { Signal } from "./signal.js";
export { SemaphoreFlowController } from "./semaphore-flow-controller.js";
export { TokenBucket } from "./token-bucket.js";
export { TokenBucketFlowController } from "./token-bucket-flow-controller.js";
export { CompositeFlowController } from "./composite-flow-controller.js";
export { LocalFlowControllerProvider } from "./local-flow-controller-provider.js";

// Operation dispatcher
export { DefaultOperationDispatcher } from "./operation-dispatcher.js";
export type { OperationDispatcher, OperationMiddleware } from "./operation-dispatcher.js";
export { countingMiddleware } from "./middleware/counting-middleware.js";
export { rateLimitingMiddleware } from "./middleware/rate-limiting-middleware.js";
export type { OperationCounts } from "./middleware/counting-middleware.js";
export { DispatchingOperationExecutor } from './dispatching-operation-executor.js'

// StandardLoaderEnv
export {StandardLoaderEnv} from "./standard-loader-env.js";

// Errors
export { Execution, ErrUnknownEntityType, ErrNoResolver, ErrNoCollectionLoader, ErrTaskNotFound, ErrUnknownTargetKind, ErrLimitStrategyConflict } from "./errors.js";

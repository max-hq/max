/**
 * Task - The unit of work in the execution layer.
 *
 * Tasks are persistable - payloads reference entities and loaders by name,
 * not by runtime object. The executor's registries resolve names back to
 * runtime objects at execution time.
 */

import type {Id} from "@max/core";
import type {RefKey, EntityType, LoaderName} from "@max/core";
import type {SyncId} from "./sync-handle.js";

// ============================================================================
// Task Identity
// ============================================================================

export type TaskId = Id<"task-id">;

// ============================================================================
// Task State Machine
// ============================================================================

/**
 * TaskState lifecycle:
 *   new → pending → running → completed
 *                           → failed
 *                           → awaiting_children → completed
 *   Any state → paused → pending (resume)
 *   Any state → cancelled
 */
export type TaskState =
  | "new"                // Created but not yet claimable (e.g., scheduled, rate-limited)
  | "pending"            // Ready to be claimed
  | "running"            // Claimed by a worker
  | "awaiting_children"  // Waiting for child tasks to complete
  | "completed"          // Done
  | "failed"             // Failed (with error)
  | "paused"             // Manually paused
  | "cancelled";         // Cancelled

// ============================================================================
// Task Payloads (serialisable)
// ============================================================================

export interface LoadFieldsPayload {
  readonly kind: "load-fields";
  readonly entityType: EntityType;
  readonly refKeys: readonly RefKey[];
  readonly fields: readonly string[];
}

export interface LoadCollectionPayload {
  readonly kind: "load-collection";
  readonly entityType: EntityType;
  readonly targetEntityType?: EntityType;
  readonly refKey: RefKey;
  readonly field: string;
  readonly cursor?: string;
}

export interface SyncStepPayload {
  readonly kind: "sync-step";
  readonly target: SerialisedStepTarget;
  readonly operation: SerialisedStepOperation;
}

export interface SyncGroupPayload {
  readonly kind: "sync-group";
}

export type TaskPayload =
  | LoadFieldsPayload
  | LoadCollectionPayload
  | SyncStepPayload
  | SyncGroupPayload;

// ============================================================================
// Serialised Step (for sync-step tasks)
// ============================================================================

export interface ForAllTarget {
  readonly kind: "forAll";
  readonly entityType: EntityType;
  /** Pagination cursor for iterating over refs in the engine. */
  readonly cursor?: string;
}

export interface ForRootTarget {
  readonly kind: "forRoot";
  readonly entityType: EntityType;
  readonly refKey: RefKey;
}

export interface ForOneTarget {
  readonly kind: "forOne";
  readonly entityType: EntityType;
  readonly refKey: RefKey;
}

export type SerialisedStepTarget = ForAllTarget | ForRootTarget | ForOneTarget;

export interface SerialisedStepOperation {
  readonly kind: "loadFields" | "loadCollection";
  readonly fields?: readonly string[];
  readonly field?: string;
}


// ============================================================================
// Task
// ============================================================================

export interface Task {
  readonly id: TaskId;
  readonly syncId: SyncId;
  readonly state: TaskState;
  readonly payload: TaskPayload;
  readonly parentId?: TaskId;
  readonly blockedBy?: TaskId;
  readonly notBefore?: Date;
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly error?: string;
}

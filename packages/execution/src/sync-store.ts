/**
 * SyncStore - Interface for persisting sync records.
 *
 * Tracks the lifecycle of each sync run. The _max_sync table provides
 * a first-class record of syncs, replacing the previous approach of
 * deriving sync state solely from task rows.
 */

import type { SyncId, SyncStatus } from "./sync-handle.js";

// ============================================================================
// SyncRecord
// ============================================================================

export interface SyncRecord {
  readonly id: SyncId;
  readonly status: SyncStatus;
  readonly startedAt: Date;
  readonly completedAt?: Date;
}

// ============================================================================
// SyncStore Interface
// ============================================================================

export interface SyncStore {
  /** Generate the next sync ID. Synchronous, counter-based. */
  nextId(): SyncId;

  /** Persist a new sync record with status "running". */
  create(id: SyncId): Promise<void>;

  /** Update the status of a sync (sets completedAt for terminal states). */
  setStatus(id: SyncId, status: SyncStatus): Promise<void>;

  /** Get a sync record by ID. */
  get(id: SyncId): Promise<SyncRecord | null>;

  /** List recent syncs, most recent first. */
  list(limit?: number): Promise<SyncRecord[]>;
}

/**
 * SqliteSyncStore - SQLite-backed implementation of SyncStore.
 *
 * Persists sync records in the _max_sync table. Resumes the sync ID
 * counter from existing data on construction (survives restarts).
 */

import type { Database } from "bun:sqlite";
import type { SyncStore, SyncRecord } from "@max/execution";
import type { SyncId, SyncStatus } from "@max/execution";

// ============================================================================
// Row type
// ============================================================================

interface SyncRow {
  id: string;
  status: string;
  started_at: number;
  completed_at: number | null;
}

function rowToRecord(row: SyncRow): SyncRecord {
  return {
    id: row.id as SyncId,
    status: row.status as SyncStatus,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at != null ? new Date(row.completed_at) : undefined,
  };
}

// ============================================================================
// SqliteSyncStore
// ============================================================================

export class SqliteSyncStore implements SyncStore {
  private counter: number;

  constructor(private db: Database) {
    const row = db
      .query(
        "SELECT MAX(CAST(REPLACE(id, 'sync-', '') AS INTEGER)) as max_id FROM _max_sync",
      )
      .get() as { max_id: number | null } | null;
    this.counter = row?.max_id ?? 0;
  }

  nextId(): SyncId {
    return `sync-${++this.counter}` as SyncId;
  }

  async create(id: SyncId): Promise<void> {
    this.db.run(
      `INSERT INTO _max_sync (id, status, started_at) VALUES (?, ?, ?)`,
      [id, "running", Date.now()],
    );
  }

  async setStatus(id: SyncId, status: SyncStatus): Promise<void> {
    const isTerminal =
      status === "completed" || status === "failed" || status === "cancelled";
    if (isTerminal) {
      this.db.run(
        `UPDATE _max_sync SET status = ?, completed_at = ? WHERE id = ?`,
        [status, Date.now(), id],
      );
    } else {
      this.db.run(`UPDATE _max_sync SET status = ? WHERE id = ?`, [
        status,
        id,
      ]);
    }
  }

  async get(id: SyncId): Promise<SyncRecord | null> {
    const row = this.db
      .query(`SELECT * FROM _max_sync WHERE id = ?`)
      .get(id) as SyncRow | null;
    return row ? rowToRecord(row) : null;
  }

  async list(limit: number = 10): Promise<SyncRecord[]> {
    const rows = this.db
      .query(
        `SELECT * FROM _max_sync ORDER BY started_at DESC LIMIT ?`,
      )
      .all(limit) as SyncRow[];
    return rows.map(rowToRecord);
  }
}

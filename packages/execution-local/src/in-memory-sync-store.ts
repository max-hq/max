/**
 * InMemorySyncStore - Simple in-memory implementation of SyncStore.
 */

import type { SyncStore, SyncRecord, SyncId, SyncStatus } from "@max/execution";

export class InMemorySyncStore implements SyncStore {
  private records = new Map<SyncId, SyncRecord>();
  private counter = 0;

  nextId(): SyncId {
    return `sync-${++this.counter}` as SyncId;
  }

  async create(id: SyncId): Promise<void> {
    this.records.set(id, {
      id,
      status: "running",
      startedAt: new Date(),
    });
  }

  async setStatus(id: SyncId, status: SyncStatus): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) return;
    const isTerminal = status === "completed" || status === "failed" || status === "cancelled";
    this.records.set(id, {
      ...existing,
      status,
      completedAt: isTerminal ? new Date() : existing.completedAt,
    });
  }

  async get(id: SyncId): Promise<SyncRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(limit: number = 10): Promise<SyncRecord[]> {
    return Array.from(this.records.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }
}

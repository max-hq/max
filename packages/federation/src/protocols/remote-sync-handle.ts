/**
 * RemoteSyncHandle — Thin data wrapper for SyncHandle over RPC.
 *
 * Returned by InstallationClientProxy.sync(). Holds the handle's data
 * (id, startedAt) and routes subsequent operations (status, pause,
 * cancel, completion) as regular root-target RPC calls with syncId as
 * the first argument.
 *
 * No separate proxy+handler pair — sync methods are regular root dispatches.
 */

import type { Transport, RpcRequest } from "@max/core"
import type { SyncHandle, SyncId, SyncResult, SyncStatus } from "@max/execution"

export class RemoteSyncHandle implements SyncHandle {
  readonly id: SyncId
  readonly startedAt: Date

  constructor(
    private readonly transport: Transport,
    info: { id: SyncId; startedAt: string },
  ) {
    this.id = info.id
    this.startedAt = new Date(info.startedAt)
  }

  async status(): Promise<SyncStatus> {
    return this.rpc("syncStatus", this.id)
  }

  async pause(): Promise<void> {
    return this.rpc("syncPause", this.id)
  }

  async cancel(): Promise<void> {
    return this.rpc("syncCancel", this.id)
  }

  async completion(): Promise<SyncResult> {
    return this.rpc("syncCompletion", this.id)
  }

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: crypto.randomUUID(), target: "", method, args }
    return this.transport.send(request)
  }
}

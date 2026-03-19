/**
 * InstallationMax — Is a single Max for a single connection.
 *
 * Implements InstallationClient.
 */

import {
  type ConnectorVersionIdentifier,
  type Engine,
  Env,
  HealthStatus,
  type InstallationScope,
  LifecycleManager,
  type Schema,
  type SeederAny,
  type SeederEnv,
  StartResult,
  StopResult,
} from '@max/core'
import {type Installation} from "@max/connector";
import {SyncExecutor, type SyncHandle, type SyncId, type SyncObserver, type SyncStore} from "@max/execution";
import type {InstallationClient, InstallationDescription} from "../protocols/installation-client.js";

// ============================================================================
// Implementation
// ============================================================================

export interface InstallationMaxConstructable {
  connector: ConnectorVersionIdentifier;
  name: string;
  installation: Installation;
  schema: Schema;
  seeder: SeederAny;
  engine: Engine
  syncExecutor: SyncExecutor
}


export class InstallationMax implements InstallationClient {
  private readonly config: InstallationMaxConstructable;

  private seederEnv: SeederEnv

  lifecycle = LifecycleManager.auto(() => [
    this.config.installation,
    this.config.engine,
    this.config.syncExecutor
  ]);

  constructor(config: InstallationMaxConstructable) {
    this.config = config;
    this.seederEnv = Env.seeder({
      ctx: config.installation.context,
      engine: config.engine,
    })
  }

  async describe(): Promise<InstallationDescription> {
    return {
      connector: this.config.connector,
      name: this.config.name,
      schema: this.config.schema,
    }
  }

  async schema(): Promise<Schema> {
    return this.config.schema;
  }

  get engine(): Engine<InstallationScope> {
    return this.config.engine
  }

  get syncStore(): SyncStore | undefined {
    return this.config.syncExecutor.syncStore;
  }

  async sync(options?: { observer?: SyncObserver }): Promise<SyncHandle> {
    const plan = await this.config.seeder.seed(this.seederEnv);
    return this.config.syncExecutor.execute(plan, { observer: options?.observer });
  }

  async syncResume(syncId: SyncId, options?: { observer?: SyncObserver }): Promise<SyncHandle> {
    return this.config.syncExecutor.resume(syncId, { observer: options?.observer });
  }

  // --------------------------------------------------------------------------
  // Supervised (parent-facing boundary)
  // --------------------------------------------------------------------------

  async health() {
    return HealthStatus.healthy()
  }

  async start(): Promise<StartResult> {
    await this.lifecycle.start()
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    await this.lifecycle.stop()
    return StopResult.stopped()
  }

}

import {
  ConnectorVersionIdentifier,
  InstallationId,
  ISODateString,
  type Lifecycle,
  LifecycleManager,
  Locator,
  LocatorURI,
} from '@max/core'
import { BasicRegistry, InMemoryBasicRegistry } from './basic-registry.js'
import {DeploymentConfig} from "../deployers/index.js";
import {InstallationSpec} from "../config/index.js";

export interface InstallationRegistryEntry {
  readonly id: InstallationId
  readonly connector: ConnectorVersionIdentifier
  readonly name: string
  readonly connectedAt: ISODateString
  readonly deployment: DeploymentConfig // strategy + deployer-specific config — enough to recreate
  readonly spec: InstallationSpec // what the node is — needed alongside deployment for recreation
  readonly locator: LocatorURI
}

export interface InstallationRegistry extends BasicRegistry<
  InstallationRegistryEntry,
  InstallationId
>, Lifecycle {}

export class InMemoryInstallationRegistry
  extends InMemoryBasicRegistry<InstallationRegistryEntry, InstallationId>
  implements InstallationRegistry
{
  lifecycle = LifecycleManager.empty()

  constructor() {
    super('installation', (value) => value.id)
  }
}

/**
 * Lightweight summary for listing installations.
 */
export interface InstallationInfo {
  readonly connector: ConnectorVersionIdentifier
  readonly name: string
  readonly id: InstallationId
  readonly connectedAt: string
  readonly locator: LocatorURI
}

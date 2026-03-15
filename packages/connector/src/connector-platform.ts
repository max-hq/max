/**
 * ConnectorPlatform - Framework services provided to connectors at initialise() time.
 *
 * Intentionally minimal. As the platform grows, it can offer more services
 * to connectors (e.g. provider resolution for Hoax mode).
 */

import type { CredentialProvider } from './credential-provider.js'

export interface ConnectorPlatform {
  readonly credentials: CredentialProvider;
}

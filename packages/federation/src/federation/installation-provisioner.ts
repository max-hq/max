/**
 * InstallationProvisioner - provisions the storage layout for an installation.
 *
 * Ensures the installation data directory exists before services
 * (engine, credential store, etc.) attempt to write to it.
 *
 * Ephemeral installations use NoOpInstallationProvisioner.
 */

export interface InstallationProvisioner {
  provision(dataDir: string): void | Promise<void>
}

export const NoOpInstallationProvisioner: InstallationProvisioner = {
  provision() {},
}

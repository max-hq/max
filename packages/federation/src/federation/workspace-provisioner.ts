/**
 * WorkspaceProvisioner — Provisions the filesystem layout for a workspace.
 *
 * Responsible for ensuring the physical structure of a workspace exists
 * (e.g. .max/, max.json, .gitignore).
 *
 * Ephemeral workspaces use NoOpWorkspaceProvisioner.
 */

export interface WorkspaceProvisioner {
  provision(workspaceRoot: string): void | Promise<void>
}

export const NoOpWorkspaceProvisioner: WorkspaceProvisioner = {
  provision() {},
}


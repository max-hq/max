/**
 * Acme Operations - Named, typed API operations for the Acme connector.
 *
 * Each operation wraps a single Acme API call. Loaders dispatch through
 * these via env.ops.execute(Op, input) rather than reaching into the
 * API client directly.
 */

import { Operation } from "@max/core";
import type { Workspace, User, Project, Task } from "@max/acme";
import { AcmeAppContext } from "./context.js";


// ============================================================================
// Workspace operations
// ============================================================================

export const ListWorkspaces = Operation.define({
  name: "acme:workspace:list",
  context: AcmeAppContext,
  async handle(_input: {}, ctx): Promise<Workspace[]> {
    return ctx.api.client.listWorkspaces();
  },
});

export const GetWorkspace = Operation.define({
  name: 'acme:workspace:get',
  context: AcmeAppContext,
  async handle(input: { id: string }, ctx): Promise<Workspace> {
    return ctx.api.client.getWorkspace(input.id)
  },
})

// ============================================================================
// User operations
// ============================================================================

export const ListUsers = Operation.define({
  name: 'acme:user:list',
  context: AcmeAppContext,
  async handle(input: { workspaceId: string }, ctx): Promise<User[]> {
    return ctx.api.client.listUsers(input.workspaceId)
  },
})

export const GetUser = Operation.define({
  name: 'acme:user:get',
  context: AcmeAppContext,
  async handle(input: { id: string }, ctx): Promise<User> {
    return ctx.api.client.getUser(input.id)
  },
})

// ============================================================================
// Project operations
// ============================================================================

export const ListProjects = Operation.define({
  name: 'acme:project:list',
  context: AcmeAppContext,
  async handle(input: { workspaceId: string }, ctx): Promise<Project[]> {
    return ctx.api.client.listProjects(input.workspaceId)
  },
})

export const GetProject = Operation.define({
  name: 'acme:project:get',
  context: AcmeAppContext,
  async handle(input: { id: string }, ctx): Promise<Project> {
    return ctx.api.client.getProject(input.id)
  },
})

// ============================================================================
// Task operations
// ============================================================================

export const ListTasks = Operation.define({
  name: 'acme:task:list',
  context: AcmeAppContext,
  async handle(input: { projectId: string }, ctx): Promise<Task[]> {
    return ctx.api.client.listTasks(input.projectId)
  },
})

// ============================================================================
// All operations (for ConnectorDef registration)
// ============================================================================

export const AcmeOperations = [
  ListWorkspaces,
  GetWorkspace,
  ListUsers,
  GetUser,
  ListProjects,
  GetProject,
  ListTasks,
] as const;

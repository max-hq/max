/**
 * Acme Operations - Named, typed API operations for the Acme connector.
 *
 * Each operation wraps a single Acme API call. Loaders dispatch through
 * these via env.ops.execute(Op, input) rather than reaching into the
 * API client directly.
 */

import { Operation } from "@max/core";
import type { Workspace, User, Project, Task } from "@max/acme";
import type { InferContext } from "@max/core";
import type { AcmeAppContext } from "./context.js";

type Ctx = InferContext<AcmeAppContext>;

// ============================================================================
// Workspace operations
// ============================================================================

export const ListWorkspaces = Operation.define({
  name: "acme:workspace:list",
  async handle(_input: {}, ctx: Ctx): Promise<Workspace[]> {
    return ctx.api.client.listWorkspaces();
  },
});

export const GetWorkspace = Operation.define({
  name: "acme:workspace:get",
  async handle(input: { id: string }, ctx: Ctx): Promise<Workspace> {
    return ctx.api.client.getWorkspace(input.id);
  },
});

// ============================================================================
// User operations
// ============================================================================

export const ListUsers = Operation.define({
  name: "acme:user:list",
  async handle(input: { workspaceId: string }, ctx: Ctx): Promise<User[]> {
    return ctx.api.client.listUsers(input.workspaceId);
  },
});

export const GetUser = Operation.define({
  name: "acme:user:get",
  async handle(input: { id: string }, ctx: Ctx): Promise<User> {
    return ctx.api.client.getUser(input.id);
  },
});

// ============================================================================
// Project operations
// ============================================================================

export const ListProjects = Operation.define({
  name: "acme:project:list",
  async handle(input: { workspaceId: string }, ctx: Ctx): Promise<Project[]> {
    return ctx.api.client.listProjects(input.workspaceId);
  },
});

export const GetProject = Operation.define({
  name: "acme:project:get",
  async handle(input: { id: string }, ctx: Ctx): Promise<Project> {
    return ctx.api.client.getProject(input.id);
  },
});

// ============================================================================
// Task operations
// ============================================================================

export const ListTasks = Operation.define({
  name: "acme:task:list",
  async handle(input: { projectId: string }, ctx: Ctx): Promise<Task[]> {
    return ctx.api.client.listTasks(input.projectId);
  },
});

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

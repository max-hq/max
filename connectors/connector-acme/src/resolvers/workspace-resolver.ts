/**
 * AcmeWorkspace Resolver - Maps AcmeWorkspace fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeWorkspace, AcmeUser, AcmeProject } from "../entities.js";
import { AcmeAppContext } from "../context.js";
import { GetWorkspace, ListUsers, ListProjects } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const WorkspaceBasicLoader = Loader.entity({
  name: "acme:workspace:basic",
  context: AcmeAppContext,
  entity: AcmeWorkspace,

  async load(ref, env) {
    const ws = await env.ops.execute(GetWorkspace, { id: ref.id });
    return EntityInput.create(ref, {
      name: ws.name,
    });
  },
});

export const WorkspaceUsersLoader = Loader.collection({
  name: "acme:workspace:users",
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeUser,

  async load(ref, page, env) {
    const users = await env.ops.execute(ListUsers, { workspaceId: ref.id });
    const items = users.map((u) =>
      EntityInput.create(AcmeUser.ref(u.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

export const WorkspaceProjectsLoader = Loader.collection({
  name: "acme:workspace:projects",
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeProject,

  async load(ref, page, env) {
    const projects = await env.ops.execute(ListProjects, { workspaceId: ref.id });
    const items = projects.map((p) =>
      EntityInput.create(AcmeProject.ref(p.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeWorkspaceResolver = Resolver.for(AcmeWorkspace, {
  name: WorkspaceBasicLoader.field("name"),
  users: WorkspaceUsersLoader.field(),
  projects: WorkspaceProjectsLoader.field(),
});

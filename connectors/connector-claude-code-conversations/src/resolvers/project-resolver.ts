/**
 * Project Resolver — Loads project metadata and discovers sessions.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { Project, Session } from "../entities.js";
import { CCConversationsContext } from "../context.js";
import { sessionId } from "../claude-client.js";

// ============================================================================
// Loaders
// ============================================================================

export const ProjectBasicLoader = Loader.entity({
  name: "conversations:project:basic" as LoaderName,
  context: CCConversationsContext,
  entity: Project,

  async load(ref, ctx) {
    const info = await ctx.client.getProjectInfo(ref.id);
    return EntityInput.create(ref, {
      name: info.name,
      path: info.path,
    });
  },
});

export const ProjectSessionsLoader = Loader.collection({
  name: "conversations:project:sessions" as LoaderName,
  context: CCConversationsContext,
  entity: Project,
  target: Session,

  async load(ref, _page, ctx) {
    const sessionUuids = await ctx.client.listSessions(ref.id);
    const items = sessionUuids.map((uuid) =>
      EntityInput.create(Session.ref(sessionId(ref.id, uuid)), {}),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const ProjectResolver = Resolver.for(Project, {
  name: ProjectBasicLoader.field("name"),
  path: ProjectBasicLoader.field("path"),
  sessions: ProjectSessionsLoader.field(),
});

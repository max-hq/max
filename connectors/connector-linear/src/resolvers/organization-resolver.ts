/**
 * LinearOrganization Resolver — Discovers teams, users, and projects from the org root.
 *
 * All loaders use raw GraphQL for exact field selection in a single HTTP request.
 * Collection loaders populate all available fields eagerly to avoid N+1 entity fetches.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { LinearOrganization, LinearTeam, LinearUser, LinearProject } from "../entities.js";
import { LinearContext } from "../context.js";

// ============================================================================
// GraphQL response types
// ============================================================================

interface OrgResponse {
  organization: {
    name: string;
    urlKey: string;
  };
}

interface TeamsResponse {
  teams: {
    nodes: Array<{
      id: string;
      name: string;
      key: string;
      description: string | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

interface UsersResponse {
  users: {
    nodes: Array<{
      id: string;
      name: string;
      email: string;
      displayName: string;
      active: boolean;
      admin: boolean;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

interface ProjectsResponse {
  projects: {
    nodes: Array<{
      id: string;
      name: string;
      description: string | null;
      state: string;
      progress: number;
      startDate: string | null;
      targetDate: string | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

// ============================================================================
// Loaders
// ============================================================================

export const OrgBasicLoader = Loader.entity({
  name: "linear:org:basic" as LoaderName,
  context: LinearContext,
  entity: LinearOrganization,

  async load(ref, ctx) {
    const { organization: org } = await ctx.api.graphql<OrgResponse>(
      `{ organization { name urlKey } }`,
    );
    return EntityInput.create(ref, {
      name: org.name,
      urlKey: org.urlKey,
    });
  },
});

export const OrgTeamsLoader = Loader.collection({
  name: "linear:org:teams" as LoaderName,
  context: LinearContext,
  entity: LinearOrganization,
  target: LinearTeam,

  async load(_ref, page, ctx) {
    const data = await ctx.api.graphql<TeamsResponse>(
      `query($cursor: String) {
        teams(first: 250, after: $cursor) {
          nodes { id name key description }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor: page.cursor },
    );
    const items = data.teams.nodes.map((t) =>
      EntityInput.create(LinearTeam.ref(t.id), {
        name: t.name,
        key: t.key,
        description: t.description ?? undefined,
      }),
    );
    return Page.from(items, data.teams.pageInfo.hasNextPage, data.teams.pageInfo.endCursor);
  },
});

export const OrgUsersLoader = Loader.collection({
  name: "linear:org:users" as LoaderName,
  context: LinearContext,
  entity: LinearOrganization,
  target: LinearUser,

  async load(_ref, page, ctx) {
    const data = await ctx.api.graphql<UsersResponse>(
      `query($cursor: String) {
        users(first: 250, after: $cursor) {
          nodes { id name email displayName active admin }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor: page.cursor },
    );
    const items = data.users.nodes.map((u) =>
      EntityInput.create(LinearUser.ref(u.id), {
        name: u.name,
        email: u.email,
        displayName: u.displayName,
        active: u.active,
        admin: u.admin,
      }),
    );
    return Page.from(items, data.users.pageInfo.hasNextPage, data.users.pageInfo.endCursor);
  },
});

export const OrgProjectsLoader = Loader.collection({
  name: "linear:org:projects" as LoaderName,
  context: LinearContext,
  entity: LinearOrganization,
  target: LinearProject,

  async load(_ref, page, ctx) {
    const data = await ctx.api.graphql<ProjectsResponse>(
      `query($cursor: String) {
        projects(first: 250, after: $cursor) {
          nodes { id name description state progress startDate targetDate }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor: page.cursor },
    );
    const items = data.projects.nodes.map((p) =>
      EntityInput.create(LinearProject.ref(p.id), {
        name: p.name,
        description: p.description ?? undefined,
        state: p.state,
        progress: p.progress,
        startDate: p.startDate ?? undefined,
        targetDate: p.targetDate ?? undefined,
      }),
    );
    return Page.from(items, data.projects.pageInfo.hasNextPage, data.projects.pageInfo.endCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const LinearOrganizationResolver = Resolver.for(LinearOrganization, {
  name: OrgBasicLoader.field("name"),
  urlKey: OrgBasicLoader.field("urlKey"),
  teams: OrgTeamsLoader.field(),
  users: OrgUsersLoader.field(),
  projects: OrgProjectsLoader.field(),
});

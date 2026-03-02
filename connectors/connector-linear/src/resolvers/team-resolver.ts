/**
 * LinearTeam Resolver — Loads team details, issues, and members.
 *
 * All loaders use raw GraphQL for exact field selection. Issue state names
 * and assignee IDs are resolved inline in the query (e.g. `state { name }`,
 * `assignee { id }`), eliminating N+1 queries entirely.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { LinearTeam, LinearIssue, LinearUser, LinearProject } from "../entities.js";
import { LinearContext } from "../context.js";

// ============================================================================
// GraphQL response types
// ============================================================================

interface TeamResponse {
  team: {
    name: string;
    key: string;
    description: string | null;
  };
}

interface TeamIssuesResponse {
  team: {
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        priority: number;
        state: { name: string } | null;
        assignee: { id: string } | null;
        project: { id: string } | null;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

interface TeamMembersResponse {
  team: {
    members: {
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
  };
}

// ============================================================================
// Loaders
// ============================================================================

export const TeamBasicLoader = Loader.entity({
  name: "linear:team:basic" as LoaderName,
  context: LinearContext,
  entity: LinearTeam,

  async load(ref, ctx) {
    const data = await ctx.api.graphql<TeamResponse>(
      `query($id: String!) {
        team(id: $id) { name key description }
      }`,
      { id: ref.id },
    );
    return EntityInput.create(ref, {
      name: data.team.name,
      key: data.team.key,
      description: data.team.description ?? undefined,
    });
  },
});

export const TeamIssuesLoader = Loader.collection({
  name: "linear:team:issues" as LoaderName,
  context: LinearContext,
  entity: LinearTeam,
  target: LinearIssue,

  async load(ref, page, ctx) {
    const data = await ctx.api.graphql<TeamIssuesResponse>(
      `query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          issues(first: 250, after: $cursor) {
            nodes {
              id identifier title description priority
              state { name }
              assignee { id }
              project { id }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { teamId: ref.id, cursor: page.cursor },
    );
    const result = data.team.issues;
    const items = result.nodes.map((i) =>
      EntityInput.create(LinearIssue.ref(i.id), {
        identifier: i.identifier,
        title: i.title,
        description: i.description ?? undefined,
        priority: i.priority,
        state: i.state?.name ?? undefined,
        assignee: i.assignee ? LinearUser.ref(i.assignee.id) : undefined,
        project: i.project ? LinearProject.ref(i.project.id) : undefined,
      }),
    );
    return Page.from(items, result.pageInfo.hasNextPage, result.pageInfo.endCursor);
  },
});

export const TeamMembersLoader = Loader.collection({
  name: "linear:team:members" as LoaderName,
  context: LinearContext,
  entity: LinearTeam,
  target: LinearUser,

  async load(ref, page, ctx) {
    const data = await ctx.api.graphql<TeamMembersResponse>(
      `query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          members(first: 250, after: $cursor) {
            nodes { id name email displayName active admin }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { teamId: ref.id, cursor: page.cursor },
    );
    const result = data.team.members;
    const items = result.nodes.map((u) =>
      EntityInput.create(LinearUser.ref(u.id), {
        name: u.name,
        email: u.email,
        displayName: u.displayName,
        active: u.active,
        admin: u.admin,
      }),
    );
    return Page.from(items, result.pageInfo.hasNextPage, result.pageInfo.endCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const LinearTeamResolver = Resolver.for(LinearTeam, {
  name: TeamBasicLoader.field("name"),
  key: TeamBasicLoader.field("key"),
  description: TeamBasicLoader.field("description"),
  issues: TeamIssuesLoader.field(),
  members: TeamMembersLoader.field(),
});

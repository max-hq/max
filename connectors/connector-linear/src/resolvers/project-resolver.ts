/**
 * LinearProject Resolver — Loads project details and issues.
 *
 * The issue collection loader populates all available fields eagerly,
 * same strategy as TeamIssuesLoader. Although issues will also be discovered
 * via team loading, the sync engine may overwrite fields — so we must
 * provide complete data here too.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { LinearProject, LinearIssue, LinearUser } from "../entities.js";
import { LinearContext } from "../context.js";

// ============================================================================
// GraphQL response types
// ============================================================================

interface ProjectResponse {
  project: {
    name: string;
    description: string | null;
    state: string;
    progress: number;
    startDate: string | null;
    targetDate: string | null;
  };
}

interface ProjectIssuesResponse {
  project: {
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        priority: number;
        state: { name: string } | null;
        assignee: { id: string } | null;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

// ============================================================================
// Loaders
// ============================================================================

export const ProjectBasicLoader = Loader.entity({
  name: "linear:project:basic" as LoaderName,
  context: LinearContext,
  entity: LinearProject,

  async load(ref, ctx) {
    const data = await ctx.api.graphql<ProjectResponse>(
      `query($id: String!) {
        project(id: $id) { name description state progress startDate targetDate }
      }`,
      { id: ref.id },
    );
    const p = data.project;
    return EntityInput.create(ref, {
      name: p.name,
      description: p.description ?? undefined,
      state: p.state,
      progress: p.progress,
      startDate: p.startDate ?? undefined,
      targetDate: p.targetDate ?? undefined,
    });
  },
});

export const ProjectIssuesLoader = Loader.collection({
  name: "linear:project:issues" as LoaderName,
  context: LinearContext,
  entity: LinearProject,
  target: LinearIssue,

  async load(ref, page, ctx) {
    const data = await ctx.api.graphql<ProjectIssuesResponse>(
      `query($projectId: String!, $cursor: String) {
        project(id: $projectId) {
          issues(first: 250, after: $cursor) {
            nodes {
              id identifier title description priority
              state { name }
              assignee { id }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { projectId: ref.id, cursor: page.cursor },
    );
    const result = data.project.issues;
    const items = result.nodes.map((i) =>
      EntityInput.create(LinearIssue.ref(i.id), {
        identifier: i.identifier,
        title: i.title,
        description: i.description ?? undefined,
        priority: i.priority,
        state: i.state?.name ?? undefined,
        assignee: i.assignee ? LinearUser.ref(i.assignee.id) : undefined,
        project: LinearProject.ref(ref.id),
      }),
    );
    return Page.from(items, result.pageInfo.hasNextPage, result.pageInfo.endCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const LinearProjectResolver = Resolver.for(LinearProject, {
  name: ProjectBasicLoader.field("name"),
  description: ProjectBasicLoader.field("description"),
  state: ProjectBasicLoader.field("state"),
  progress: ProjectBasicLoader.field("progress"),
  startDate: ProjectBasicLoader.field("startDate"),
  targetDate: ProjectBasicLoader.field("targetDate"),
  issues: ProjectIssuesLoader.field(),
});

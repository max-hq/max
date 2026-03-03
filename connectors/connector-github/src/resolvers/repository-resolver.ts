/**
 * GitHubRepository Resolver - Loads repo metadata and issues collection.
 *
 * RepoIssuesLoader eagerly populates all issue fields. User entities are
 * referenced by login (e.g. GitHubUser.ref("octocat")) - user fields like
 * avatarUrl and url are populated on-demand by UserBasicLoader (autoload).
 *
 * NOTE: Design tension - the issues response includes full user data inline
 * but collection loaders can only return their target entity type. A future
 * "dependent loader" pattern could allow a single API response to populate
 * multiple entity types. See docs/DESIGN-dependent-loaders.md (pending).
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { GitHubRepository, GitHubIssue, GitHubUser } from "../entities.js";
import { GitHubContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const RepoBasicLoader = Loader.entity({
  name: "github:repo:basic" as LoaderName,
  context: GitHubContext,
  entity: GitHubRepository,
  strategy: "autoload",

  async load(ref, ctx) {
    const data = await ctx.api.getRepo();
    return EntityInput.create(ref, {
      name: data.name,
      description: data.description ?? undefined,
      url: data.html_url,
    });
  },
});

export const RepoIssuesLoader = Loader.collection({
  name: "github:repo:issues" as LoaderName,
  context: GitHubContext,
  entity: GitHubRepository,
  target: GitHubIssue,

  async load(_ref, page, ctx) {
    // Cursor is the page number (1-based). Default to page 1.
    const pageNum = page.cursor ? parseInt(page.cursor, 10) : 1;
    const { issues, hasMore } = await ctx.api.listIssues(pageNum);

    const items = issues.map((i) =>
      EntityInput.create(GitHubIssue.ref(String(i.id)), {
        number: i.number,
        title: i.title,
        body: i.body ?? undefined,
        state: i.state,
        labels: i.labels.map((l) => l.name).join(", "),
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        author: i.user ? GitHubUser.ref(i.user.login) : undefined,
      }),
    );

    const nextCursor = hasMore ? String(pageNum + 1) : undefined;
    return Page.from(items, hasMore, nextCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GitHubRepositoryResolver = Resolver.for(GitHubRepository, {
  name: RepoBasicLoader.field("name"),
  description: RepoBasicLoader.field("description"),
  url: RepoBasicLoader.field("url"),
  issues: RepoIssuesLoader.field(),
});

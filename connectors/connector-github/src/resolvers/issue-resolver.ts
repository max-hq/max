/**
 * GitHubIssue Resolver - Loads issue details.
 *
 * In practice, most issue fields are populated eagerly by RepoIssuesLoader.
 * This entity loader serves as an autoload fallback.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  type LoaderName,
} from "@max/core";
import { GitHubIssue, GitHubUser } from "../entities.js";
import { GitHubContext } from "../context.js";
import type { GitHubIssueResponse } from "../github-client.js";

// ============================================================================
// Loaders
// ============================================================================

export const IssueBasicLoader = Loader.entity({
  name: "github:issue:basic" as LoaderName,
  context: GitHubContext,
  entity: GitHubIssue,
  strategy: "autoload",

  async load(ref, ctx) {
    // ref.id is the GitHub issue numeric ID; we need to look it up by number.
    // The issues list endpoint already populated most issues eagerly, so this
    // fallback is rarely needed. We use the /issues endpoint with the ID.
    const data = await ctx.api.request<GitHubIssueResponse>(
      `/repos/${ctx.api.owner}/${ctx.api.repo}/issues/${ref.id}`,
    );
    return EntityInput.create(ref, {
      number: data.number,
      title: data.title,
      body: data.body ?? undefined,
      state: data.state,
      labels: data.labels.map((l) => l.name).join(", "),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      author: data.user ? GitHubUser.ref(data.user.login) : undefined,
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GitHubIssueResolver = Resolver.for(GitHubIssue, {
  number: IssueBasicLoader.field("number"),
  title: IssueBasicLoader.field("title"),
  body: IssueBasicLoader.field("body"),
  state: IssueBasicLoader.field("state"),
  labels: IssueBasicLoader.field("labels"),
  createdAt: IssueBasicLoader.field("createdAt"),
  updatedAt: IssueBasicLoader.field("updatedAt"),
  author: IssueBasicLoader.field("author"),
});

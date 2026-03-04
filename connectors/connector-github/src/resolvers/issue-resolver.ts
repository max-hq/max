/**
 * GitHubIssue Resolver - Loads issue details via GraphQL.
 *
 * In practice, most issue fields are populated eagerly by RepoIssuesLoader.
 * This entity loader serves as an autoload fallback, using the GraphQL node
 * interface to look up issues by their global ID.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  type LoaderName,
} from "@max/core";
import { GitHubIssue, GitHubUser } from "../entities.js";
import { GitHubContext } from "../context.js";

// ============================================================================
// GraphQL response types
// ============================================================================

interface IssueNodeResponse {
  node: {
    number: number;
    title: string;
    body: string | null;
    state: string;
    createdAt: string;
    updatedAt: string;
    labels: { nodes: Array<{ name: string }> };
    author: { login: string; avatarUrl: string; url: string } | null;
  } | null;
}

// ============================================================================
// Loaders
// ============================================================================

export const IssueBasicLoader = Loader.entity({
  name: "github:issue:basic" as LoaderName,
  context: GitHubContext,
  entity: GitHubIssue,
  strategy: "autoload",

  async load(ref, ctx) {
    // ref.id is the GraphQL node ID (populated by RepoIssuesLoader).
    const data = await ctx.api.graphql<IssueNodeResponse>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Issue {
            number title body state createdAt updatedAt
            labels(first: 20) { nodes { name } }
            author { login avatarUrl url }
          }
        }
      }`,
      { id: ref.id },
    );
    const issue = data.node;
    if (!issue) {
      return EntityInput.create(ref, {});
    }
    return EntityInput.create(ref, {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? undefined,
      state: issue.state,
      labels: issue.labels.nodes.map((l) => l.name).join(", "),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      author: issue.author ? GitHubUser.ref(issue.author.login) : undefined,
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

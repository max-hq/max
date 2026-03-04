/**
 * GitHubRepository Resolver - Loads repo metadata and issues collection.
 *
 * All loaders use the GitHub GraphQL API (v4). The issues connection returns
 * only issues (no PRs), with cursor-based pagination and inline author data.
 *
 * User entities are referenced by login (e.g. GitHubUser.ref("octocat")) -
 * user fields like avatarUrl and url are populated on-demand by
 * UserBasicLoader (autoload).
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
// GraphQL response types
// ============================================================================

interface RepoResponse {
  repository: {
    id: string;
    name: string;
    description: string | null;
    url: string;
  };
}

interface RepoIssuesResponse {
  repository: {
    issues: {
      nodes: Array<{
        id: string;
        number: number;
        title: string;
        body: string | null;
        state: string;
        createdAt: string;
        updatedAt: string;
        labels: { nodes: Array<{ name: string }> };
        author: { login: string; avatarUrl: string; url: string } | null;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

// ============================================================================
// Loaders
// ============================================================================

export const RepoBasicLoader = Loader.entity({
  name: "github:repo:basic" as LoaderName,
  context: GitHubContext,
  entity: GitHubRepository,
  strategy: "autoload",

  async load(ref, ctx) {
    const data = await ctx.api.graphql<RepoResponse>(
      `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id name description url
        }
      }`,
      { owner: ctx.api.owner, repo: ctx.api.repo },
    );
    return EntityInput.create(ref, {
      name: data.repository.name,
      description: data.repository.description ?? undefined,
      url: data.repository.url,
    });
  },
});

export const RepoIssuesLoader = Loader.collection({
  name: "github:repo:issues" as LoaderName,
  context: GitHubContext,
  entity: GitHubRepository,
  target: GitHubIssue,

  async load(_ref, page, ctx) {
    const data = await ctx.api.graphql<RepoIssuesResponse>(
      `query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
            nodes {
              id number title body state createdAt updatedAt
              labels(first: 20) { nodes { name } }
              author { login avatarUrl url }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { owner: ctx.api.owner, repo: ctx.api.repo, cursor: page.cursor },
    );

    const result = data.repository.issues;
    const items = result.nodes.map((i) =>
      EntityInput.create(GitHubIssue.ref(i.id), {
        number: i.number,
        title: i.title,
        body: i.body ?? undefined,
        state: i.state,
        labels: i.labels.nodes.map((l) => l.name).join(", "),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        author: i.author ? GitHubUser.ref(i.author.login) : undefined,
      }),
    );

    return Page.from(items, result.pageInfo.hasNextPage, result.pageInfo.endCursor);
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

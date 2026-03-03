/**
 * GitHubUser Resolver - Loads user profile data.
 *
 * User entities are keyed by login (e.g. GitHubUser.ref("octocat")).
 * This autoload loader fetches full profile data from the GitHub API
 * when user fields beyond the ref ID are queried.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  type LoaderName,
} from "@max/core";
import { GitHubUser } from "../entities.js";
import { GitHubContext } from "../context.js";

// ============================================================================
// Response types
// ============================================================================

interface UserResponse {
  login: string;
  avatar_url: string;
  html_url: string;
}

// ============================================================================
// Loaders
// ============================================================================

export const UserBasicLoader = Loader.entity({
  name: "github:user:basic" as LoaderName,
  context: GitHubContext,
  entity: GitHubUser,
  strategy: "autoload",

  async load(ref, ctx) {
    // ref.id is the user's login
    const data = await ctx.api.request<UserResponse>(`/users/${ref.id}`);
    return EntityInput.create(ref, {
      login: data.login,
      avatarUrl: data.avatar_url,
      url: data.html_url,
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GitHubUserResolver = Resolver.for(GitHubUser, {
  login: UserBasicLoader.field("login"),
  avatarUrl: UserBasicLoader.field("avatarUrl"),
  url: UserBasicLoader.field("url"),
});

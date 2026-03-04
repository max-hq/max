/**
 * Error definitions for the GitHub connector boundary.
 */

import { MaxError, ErrFacet, InvariantViolated, BadInput } from "@max/core";

// ============================================================================
// GitHub Boundary
// ============================================================================

export const GitHub = MaxError.boundary("github");

// ============================================================================
// Error Definitions
// ============================================================================

/** Client accessed before start() was called - lifecycle violation. */
export const ErrGitHubNotStarted = GitHub.define("not_started", {
  facets: [InvariantViolated],
  message: () => "GitHubClient not started - call start() first",
});

/** HTTP-level error from the GitHub API (non-2xx response). */
export const ErrGitHubApiError = GitHub.define("api_error", {
  customProps: ErrFacet.props<{ status: number; statusText: string }>(),
  facets: [],
  message: (d) => `GitHub API error: ${d.status} ${d.statusText}`,
});

/** gh CLI is not installed or not authenticated. */
export const ErrGhCliNotAvailable = GitHub.define("gh_cli_not_available", {
  customProps: ErrFacet.props<{ reason: string }>(),
  facets: [],
  message: (d) => `GitHub CLI (gh) not available: ${d.reason}`,
});

/** Invalid repository format provided during onboarding. */
export const ErrInvalidRepoFormat = GitHub.define("invalid_repo_format", {
  customProps: ErrFacet.props<{ input: string }>(),
  facets: [BadInput],
  message: (d) => `Invalid repository format: "${d.input}". Expected "owner/repo" or a GitHub URL.`,
});

/** Repository not found or not accessible. */
export const ErrRepoNotFound = GitHub.define("repo_not_found", {
  customProps: ErrFacet.props<{ owner: string; repo: string }>(),
  facets: [],
  message: (d) => `Repository "${d.owner}/${d.repo}" not found or not accessible.`,
});

/** Unexpected HTTP status from GitHub API during validation. */
export const ErrGitHubValidationFailed = GitHub.define("validation_failed", {
  customProps: ErrFacet.props<{ status: number; statusText: string }>(),
  facets: [],
  message: (d) => `GitHub API returned ${d.status}: ${d.statusText}`,
});

/** GraphQL-level error from the GitHub v4 API. */
export const ErrGitHubGraphqlError = GitHub.define("graphql_error", {
  customProps: ErrFacet.props<{ graphqlMessage: string }>(),
  facets: [],
  message: (d) => `GitHub GraphQL error: ${d.graphqlMessage}`,
});

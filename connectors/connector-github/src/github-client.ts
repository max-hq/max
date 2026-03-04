/**
 * GitHubClient — REST + GraphQL wrapper for the GitHub API.
 *
 * Data fetching uses raw GraphQL queries (v4) for exact field selection and
 * issues-only pagination. REST (v3) is kept for health checks and general use.
 *
 * Lifecycle: start() resolves the token from the credential handle before
 * any API calls.
 */

import type { CredentialHandle } from "@max/connector";
import { ErrGitHubNotStarted, ErrGitHubApiError, ErrGitHubGraphqlError } from "./errors.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

// ============================================================================
// REST response types
// ============================================================================

export interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
}

// ============================================================================
// Client
// ============================================================================

export class GitHubClient {
  private token: string | null = null;

  constructor(
    private readonly tokenHandle: CredentialHandle<string>,
    readonly owner: string,
    readonly repo: string,
  ) {}

  async start(): Promise<void> {
    this.token = await this.tokenHandle.get();
  }

  private get headers(): Record<string, string> {
    if (!this.token) throw ErrGitHubNotStarted.create({});
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  // --------------------------------------------------------------------------
  // REST (v3)
  // --------------------------------------------------------------------------

  async request<T>(path: string): Promise<T> {
    const url = `${GITHUB_API}${path}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      throw ErrGitHubApiError.create({
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response.json() as Promise<T>;
  }

  async getRepo(): Promise<GitHubRepoResponse> {
    return this.request(`/repos/${this.owner}/${this.repo}`);
  }

  // --------------------------------------------------------------------------
  // GraphQL (v4)
  // --------------------------------------------------------------------------

  /**
   * Execute a raw GraphQL query against the GitHub v4 API.
   *
   * Preferred over REST for data fetching — allows exact field selection,
   * issues-only queries (no PR filtering), and cursor-based pagination.
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      throw ErrGitHubNotStarted.create({});
    }

    const response = await fetch(GITHUB_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw ErrGitHubApiError.create({
        status: response.status,
        statusText: response.statusText,
      });
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      throw ErrGitHubGraphqlError.create({
        graphqlMessage: json.errors[0].message,
      });
    }

    return json.data as T;
  }

  // --------------------------------------------------------------------------
  // Health
  // --------------------------------------------------------------------------

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getRepo();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}

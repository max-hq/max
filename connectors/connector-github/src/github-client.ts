/**
 * GitHubClient - REST API wrapper for the GitHub v3 API.
 *
 * Uses raw fetch with token-based auth. Lifecycle: start() resolves
 * the token from the credential handle before any API calls.
 */

import type { CredentialHandle } from "@max/connector";
import { ErrGitHubNotStarted, ErrGitHubApiError } from "./errors.js";

const GITHUB_API = "https://api.github.com";

// ============================================================================
// Response types
// ============================================================================

export interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
}

export interface GitHubIssueResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  user: { id: number; login: string; avatar_url: string; html_url: string } | null;
  labels: Array<{ id: number; name: string }>;
  pull_request?: unknown;
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

  /**
   * Fetch a page of issues (excludes pull requests).
   * Returns the issues array and whether there are more pages.
   */
  async listIssues(page: number): Promise<{ issues: GitHubIssueResponse[]; hasMore: boolean }> {
    const all = await this.request<GitHubIssueResponse[]>(
      `/repos/${this.owner}/${this.repo}/issues?state=all&per_page=100&page=${page}&sort=created&direction=asc`,
    );
    // GitHub's issues endpoint includes pull requests - filter them out
    const issues = all.filter((i) => !i.pull_request);
    // If we got a full page, there are likely more
    const hasMore = all.length === 100;
    return { issues, hasMore };
  }

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getRepo();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}

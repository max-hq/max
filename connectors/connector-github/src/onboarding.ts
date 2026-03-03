/**
 * GitHub onboarding flow - repo input, gh CLI token extraction, validation.
 *
 * Requires the GitHub CLI (gh) to be installed and authenticated.
 * The token is extracted via `gh auth token` and stored as a credential.
 */

import { OnboardingFlow, InputStep, CustomStep, ValidationStep } from "@max/connector";
import {
  ErrGhCliNotAvailable,
  ErrInvalidRepoFormat,
  ErrRepoNotFound,
  ErrGitHubValidationFailed,
} from "./errors.js";
import { GitHubToken } from "./credentials.js";
import type { GitHubConfig } from "./config.js";

/**
 * Parse a repository identifier from either:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo/anything/else"
 */
function parseRepo(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, "");

  // Try URL format
  try {
    const url = new URL(trimmed);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    // Not a URL, try owner/repo format
  }

  // Try owner/repo format
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }

  throw ErrInvalidRepoFormat.create({ input });
}

export const GitHubOnboarding = OnboardingFlow.create<GitHubConfig>([
  InputStep.create({
    label: "Repository",
    description: 'Enter the GitHub repository (e.g. "owner/repo" or "https://github.com/owner/repo")',
    fields: {
      repository: { label: "GitHub repository", type: "string" },
    },
  }),

  CustomStep.create({
    label: "Authenticate via GitHub CLI",
    async execute(accumulated, ctx) {
      // Parse the repository input into owner + repo
      const { owner, repo } = parseRepo(accumulated.repository as string);

      // Check gh CLI is available and extract token
      try {
        const proc = Bun.spawn(["gh", "auth", "token"], {
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          throw ErrGhCliNotAvailable.create({
            reason: stderr.trim() || "gh auth token failed. Run `gh auth login` first.",
          });
        }

        const token = (await new Response(proc.stdout).text()).trim();
        if (!token) {
          throw ErrGhCliNotAvailable.create({
            reason: "gh auth token returned empty. Run `gh auth login` first.",
          });
        }

        await ctx.credentialStore.set(GitHubToken.name, token);
      } catch (e) {
        if (e && typeof e === "object" && "code" in e) {
          // Bun.spawn throws if the binary doesn't exist
          throw ErrGhCliNotAvailable.create({
            reason: "gh CLI not found. Install it from https://cli.github.com",
          });
        }
        throw e;
      }

      return { owner, repo };
    },
  }),

  ValidationStep.create({
    label: "Verify repository access",
    async validate(accumulated, { credentialStore }) {
      const token = await credentialStore.get(GitHubToken.name);
      const owner = accumulated.owner as string;
      const repo = accumulated.repo as string;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw ErrRepoNotFound.create({ owner, repo });
        }
        throw ErrGitHubValidationFailed.create({
          status: response.status,
          statusText: response.statusText,
        });
      }
    },
  }),
]);

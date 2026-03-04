/**
 * @max/connector-github - GitHub Issues connector.
 */

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { GitHubSchema } from "./schema.js";
import { GitHubSeeder } from "./seeder.js";
import { GitHubRepositoryResolver } from "./resolvers/repository-resolver.js";
import { GitHubIssueResolver } from "./resolvers/issue-resolver.js";
import { GitHubUserResolver } from "./resolvers/user-resolver.js";
import { GitHubOnboarding } from "./onboarding.js";
import { GitHubContext } from "./context.js";
import { GitHubClient } from "./github-client.js";
import { GitHubToken } from "./credentials.js";
import type { GitHubConfig } from "./config.js";

// ============================================================================
// ConnectorDef
// ============================================================================

const GitHubDef = ConnectorDef.create<GitHubConfig>({
  name: "github",
  displayName: "GitHub",
  description: "GitHub Issues connector - syncs issues from a repository",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: GitHubSchema,
  onboarding: GitHubOnboarding,
  seeder: GitHubSeeder,
  resolvers: [
    GitHubRepositoryResolver,
    GitHubIssueResolver,
    GitHubUserResolver,
  ],
});

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

const GitHubConnector = ConnectorModule.create<GitHubConfig>({
  def: GitHubDef,
  initialise(config, credentials) {
    const tokenHandle = credentials.get(GitHubToken);
    const api = new GitHubClient(tokenHandle, config.owner, config.repo);

    const ctx = Context.build(GitHubContext, { api });

    return Installation.create({
      context: ctx,
      async start() {
        await api.start();
        credentials.startRefreshSchedulers();
      },
      async stop() {
        credentials.stopRefreshSchedulers();
      },
      async health() {
        const result = await api.health();
        return result.ok
          ? { status: "healthy" }
          : { status: "unhealthy", reason: result.error ?? "Unknown error" };
      },
    });
  },
});

export default GitHubConnector;

/**
 * @max/connector-slack
 *
 * Syncs Slack workspaces, channels, messages, and users into local SQLite.
 *
 * Required Bot Token scopes:
 *   channels:read, channels:history, groups:read, groups:history,
 *   users:read, users:read.email, team:read
 */

// Public exports
export { SlackRoot, SlackWorkspace, SlackUser, SlackChannel, SlackMessage } from "./entities.js";
export { SlackAppContext } from "./context.js";
export { SlackClient } from "./slack-client.js";
export type { SlackClientProvider } from "./slack-client.js";
export { SlackSchema } from "./schema.js";
export { SlackBotToken } from "./credentials.js";
export { SlackOnboarding } from "./onboarding.js";
export { SlackSeeder } from "./seeder.js";
export { SlackRootResolver } from "./resolvers/root-resolver.js";
export { SlackWorkspaceResolver } from "./resolvers/workspace-resolver.js";
export { SlackChannelResolver } from "./resolvers/channel-resolver.js";
export type { SlackConfig } from "./config.js";

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { SlackOperations } from "./operations.js";
import { SlackSchema } from "./schema.js";
import { SlackSeeder } from "./seeder.js";
import { SlackRootResolver } from "./resolvers/root-resolver.js";
import { SlackWorkspaceResolver } from "./resolvers/workspace-resolver.js";
import { SlackChannelResolver } from "./resolvers/channel-resolver.js";
import { SlackOnboarding } from "./onboarding.js";
import { SlackAppContext } from "./context.js";
import { SlackClient } from "./slack-client.js";
import { SlackBotToken } from "./credentials.js";
import type { SlackConfig } from "./config.js";

const SlackDef = ConnectorDef.create<SlackConfig>({
  name: "slack",
  displayName: "Slack",
  description: "Syncs Slack workspaces, channels, messages, and users",
  icon: "https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png",
  version: "0.1.0",
  scopes: [],
  schema: SlackSchema,
  onboarding: SlackOnboarding,
  seeder: SlackSeeder,
  resolvers: [
    SlackRootResolver,
    SlackWorkspaceResolver,
    SlackChannelResolver,
  ],
  operations: [...SlackOperations],
});

const SlackConnector = ConnectorModule.create<SlackConfig>({
  def: SlackDef,
  initialise(config, platform) {
    const tokenHandle = platform.credentials.get(SlackBotToken);

    // Build the client lazily — token is resolved at runtime by the credential store
    const clientProvider = {
      get client() {
        return new SlackClient(tokenHandle.value);
      },
    };

    const ctx = Context.build(SlackAppContext, {
      api: clientProvider,
      workspaceId: config.workspaceId,
      channelTypes: config.channelTypes ?? "all",
      maxMessagesPerChannel: config.maxMessagesPerChannel ?? 1000,
    });

    return Installation.create({
      context: ctx,
      async start() {
        platform.credentials.startRefreshSchedulers();
      },
      async stop() {
        platform.credentials.stopRefreshSchedulers();
      },
      async health() {
        try {
          await clientProvider.client.getTeam();
          return { status: "healthy" };
        } catch (err) {
          return {
            status: "unhealthy",
            reason: err instanceof Error ? err.message : "Unknown error",
          };
        }
      },
    });
  },
});

export default SlackConnector;

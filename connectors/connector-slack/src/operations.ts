/**
 * Slack Operations — named, typed wrappers around Slack Web API calls.
 *
 * Rate limit budgets (Slack Tier 2 = ~20 req/min, Tier 3 = ~50 req/min):
 *   - SlackTier2: team.info, users.list, conversations.list
 *   - SlackTier3: conversations.history, conversations.replies
 *
 * Loaders call env.ops.execute(Op, input) rather than the client directly,
 * so the concurrency limiter and retry logic apply transparently.
 */

import { Operation, Limit } from "@max/core";
import { SlackAppContext } from "./context.js";
import type {
  SlackTeam,
  SlackApiUser,
  SlackApiChannel,
  SlackApiMessage,
} from "./slack-client.js";

const SlackTier2 = Limit.concurrent("slack:tier2", 5);
const SlackTier3 = Limit.concurrent("slack:tier3", 10);

// ============================================================================
// Workspace / team
// ============================================================================

export const GetTeam = Operation.define({
  name: "slack:team:get",
  context: SlackAppContext,
  limit: SlackTier2,
  async handle(_input: {}, env): Promise<SlackTeam> {
    return env.ctx.api.client.getTeam();
  },
});

// ============================================================================
// Users
// ============================================================================

export const ListUsers = Operation.define({
  name: "slack:user:list",
  context: SlackAppContext,
  limit: SlackTier2,
  async handle(_input: {}, env): Promise<SlackApiUser[]> {
    return env.ctx.api.client.listUsers();
  },
});

// ============================================================================
// Channels
// ============================================================================

export const ListChannels = Operation.define({
  name: "slack:channel:list",
  context: SlackAppContext,
  limit: SlackTier2,
  async handle(_input: {}, env): Promise<SlackApiChannel[]> {
    return env.ctx.api.client.listChannels(env.ctx.channelTypes);
  },
});

// ============================================================================
// Messages
// ============================================================================

export const ListMessages = Operation.define({
  name: "slack:message:list",
  context: SlackAppContext,
  limit: SlackTier3,
  async handle(input: { channelId: string }, env): Promise<SlackApiMessage[]> {
    return env.ctx.api.client.listMessages(
      input.channelId,
      env.ctx.maxMessagesPerChannel
    );
  },
});

export const ListReplies = Operation.define({
  name: "slack:reply:list",
  context: SlackAppContext,
  limit: SlackTier3,
  async handle(input: { channelId: string; threadTs: string }, env): Promise<SlackApiMessage[]> {
    return env.ctx.api.client.listReplies(input.channelId, input.threadTs);
  },
});

// ============================================================================
// All operations
// ============================================================================

export const SlackOperations = [
  GetTeam,
  ListUsers,
  ListChannels,
  ListMessages,
  ListReplies,
] as const;

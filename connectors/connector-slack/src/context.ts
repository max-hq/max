/**
 * Slack connector runtime context — holds the API client and workspace config.
 */
import { Context } from "@max/core";
import type { SlackClientProvider } from "./slack-client.js";

export class SlackAppContext extends Context {
  api = Context.instance<SlackClientProvider>();
  workspaceId = Context.string;
  channelTypes = Context.string;
  maxMessagesPerChannel = Context.number;
}

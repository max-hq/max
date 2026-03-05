/**
 * ConversationsContext — Context definition for Claude Code Conversations connector.
 */

import { Context } from "@max/core";
import type { ClaudeClient } from "./claude-client.js";

export class CCConversationsContext extends Context {
  client = Context.instance<ClaudeClient>();
}

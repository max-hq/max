/**
 * ConversationsContext — Context definition for Claude Code Conversations connector.
 */

import { Context } from "@max/core";
import type { ConversationsClient } from "./conversations-client.js";

export class ConversationsContext extends Context {
  client = Context.instance<ConversationsClient>();
}

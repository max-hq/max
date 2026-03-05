/**
 * Message Resolver — Loads individual message data.
 *
 * In practice, most message fields are populated eagerly by SessionMessagesLoader.
 * This entity loader serves as an autoload fallback.
 *
 * Message IDs are composite: "{projectDir}::{sessionUuid}::{messageUuid}".
 */

import {
  Loader,
  Resolver,
  EntityInput,
  type LoaderName,
} from "@max/core";
import { Message, Session } from "../entities.js";
import { CCConversationsContext } from "../context.js";
import { parseMessageId, sessionId } from "../claude-client.js";
import { ErrMessageNotFound } from "../errors.js";

// ============================================================================
// Loaders
// ============================================================================

export const MessageBasicLoader = Loader.entity({
  name: "conversations:message:basic" as LoaderName,
  context: CCConversationsContext,
  entity: Message,
  strategy: "autoload",

  async load(ref, ctx) {
    const { projectDir, sessionUuid, messageUuid } = parseMessageId(ref.id);
    const msg = await ctx.client.getMessage(projectDir, sessionUuid, messageUuid);

    if (!msg) {
      throw ErrMessageNotFound.create({ messageId: ref.id });
    }

    return EntityInput.create(ref, {
      type: msg.type,
      content: msg.content,
      timestamp: msg.timestamp,
      model: msg.model,
      session: Session.ref(sessionId(projectDir, sessionUuid)),
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const MessageResolver = Resolver.for(Message, {
  type: MessageBasicLoader.field("type"),
  content: MessageBasicLoader.field("content"),
  timestamp: MessageBasicLoader.field("timestamp"),
  model: MessageBasicLoader.field("model"),
  session: MessageBasicLoader.field("session"),
});

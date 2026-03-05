/**
 * Session Resolver — Loads session metadata and discovers messages.
 *
 * Session IDs are composite: "{projectDir}::{sessionUuid}".
 * The loader parses the ID to locate the correct .jsonl file.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { Session, Message, Project } from "../entities.js";
import { CCConversationsContext } from "../context.js";
import { parseSessionId, messageId } from "../claude-client.js";

// ============================================================================
// Loaders
// ============================================================================

export const SessionBasicLoader = Loader.entity({
  name: "conversations:session:basic",
  context: CCConversationsContext,
  entity: Session,
  strategy: "autoload",

  async load(ref, ctx) {
    const { projectDir, sessionUuid } = parseSessionId(ref.id);
    const meta = await ctx.client.getSessionMetadata(projectDir, sessionUuid);

    return EntityInput.create(ref, {
      title: meta.title,
      summary: meta.summary,
      firstMessage: meta.firstMessage,
      model: meta.model,
      gitBranch: meta.gitBranch,
      cwd: meta.cwd,
      version: meta.version,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      messageCount: meta.messageCount,
      project: Project.ref(projectDir),
    });
  },
});

export const SessionMessagesLoader = Loader.collection({
  name: "conversations:session:messages",
  context: CCConversationsContext,
  entity: Session,
  target: Message,

  async load(ref, _page, ctx) {
    const { projectDir, sessionUuid } = parseSessionId(ref.id);
    const messages = await ctx.client.getSessionMessages(projectDir, sessionUuid);

    const items = messages.map((msg) =>
      EntityInput.create(
        Message.ref(messageId(projectDir, sessionUuid, msg.uuid)),
        {
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          model: msg.model,
          session: ref,
        },
      ),
    );

    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const SessionResolver = Resolver.for(Session, {
  title: SessionBasicLoader.field("title"),
  summary: SessionBasicLoader.field("summary"),
  firstMessage: SessionBasicLoader.field("firstMessage"),
  model: SessionBasicLoader.field("model"),
  gitBranch: SessionBasicLoader.field("gitBranch"),
  cwd: SessionBasicLoader.field("cwd"),
  version: SessionBasicLoader.field("version"),
  startedAt: SessionBasicLoader.field("startedAt"),
  endedAt: SessionBasicLoader.field("endedAt"),
  messageCount: SessionBasicLoader.field("messageCount"),
  project: SessionBasicLoader.field("project"),
  messages: SessionMessagesLoader.field(),
});

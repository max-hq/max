/**
 * GmailThread Resolver — loads individual messages within a thread.
 *
 * Note: Thread messages are fetched eagerly during the mailbox threads load
 * (via GetThread which returns full thread with messages). This resolver
 * materialises those messages into individual GmailMessage entities.
 */

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { GmailThread, GmailMessage } from "../entities.js";
import { GmailAppContext } from "../context.js";
import { GetThread } from "../operations.js";
import { extractHeader, extractTextBody } from "../gmail-client.js";

export const ThreadMessagesLoader = Loader.collection({
  name: "gmail:thread:messages",
  context: GmailAppContext,
  entity: GmailThread,
  target: GmailMessage,

  async load(ref, _page, env) {
    const thread = await env.ops.execute(GetThread, { threadId: ref.id });
    const messages = thread.messages ?? [];

    const items = messages.map((msg) => {
      const payload = msg.payload;
      const labelIds = msg.labelIds ?? [];
      const dateMs = msg.internalDate ? parseInt(msg.internalDate, 10) : Date.now();

      return EntityInput.create(GmailMessage.ref(msg.id), {
        threadId: msg.threadId,
        subject: extractHeader(payload, "Subject"),
        from: extractHeader(payload, "From"),
        to: extractHeader(payload, "To"),
        cc: extractHeader(payload, "Cc"),
        date: new Date(dateMs),
        snippet: msg.snippet,
        bodyText: extractTextBody(payload).slice(0, 10_000), // cap at 10KB
        labelIds: JSON.stringify(labelIds),
        isUnread: labelIds.includes("UNREAD"),
        isStarred: labelIds.includes("STARRED"),
      });
    });

    return Page.from(items, false, undefined);
  },
});

export const GmailThreadResolver = Resolver.for(GmailThread, {
  messages: ThreadMessagesLoader.field(),
});

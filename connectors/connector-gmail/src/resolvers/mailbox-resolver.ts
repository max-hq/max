/**
 * GmailMailbox Resolver — loads labels and threads.
 */

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { GmailMailbox, GmailLabel, GmailThread } from "../entities.js";
import { GmailAppContext } from "../context.js";
import { ListLabels, GetLabel, ListThreads, GetThread } from "../operations.js";
import { extractHeader, extractTextBody } from "../gmail-client.js";

// ============================================================================
// Labels
// ============================================================================

export const MailboxLabelsLoader = Loader.collection({
  name: "gmail:mailbox:labels",
  context: GmailAppContext,
  entity: GmailMailbox,
  target: GmailLabel,

  async load(_ref, _page, env) {
    const labels = await env.ops.execute(ListLabels, {});

    // Fetch detailed counts for each label in parallel via GetLabel
    const detailed = await Promise.all(
      labels.map((l) => env.ops.execute(GetLabel, { labelId: l.id }))
    );

    const items = detailed.map((label) =>
      EntityInput.create(GmailLabel.ref(label.id), {
        name: label.name,
        type: label.type,
        messageCount: label.messagesTotal ?? 0,
        unreadCount: label.messagesUnread ?? 0,
      })
    );

    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Threads
// ============================================================================

export const MailboxThreadsLoader = Loader.collection({
  name: "gmail:mailbox:threads",
  context: GmailAppContext,
  entity: GmailMailbox,
  target: GmailThread,

  async load(_ref, _page, env) {
    // List thread IDs, then fetch full thread data for each
    const stubs = await env.ops.execute(ListThreads, {});

    const threads = await Promise.all(
      stubs.map((stub) => env.ops.execute(GetThread, { threadId: stub.id }))
    );

    const items = threads.map((thread) => {
      const messages = thread.messages ?? [];
      const lastMsg = messages[messages.length - 1];
      const lastPayload = lastMsg?.payload;

      // Collect all unique participant email addresses across messages
      const participants = Array.from(
        new Set(
          messages.flatMap((m) => {
            const from = extractHeader(m.payload, "From");
            const to = extractHeader(m.payload, "To");
            return [from, ...to.split(",")]
              .map((e) => e.trim())
              .filter(Boolean);
          })
        )
      );

      const labelIds = Array.from(
        new Set(messages.flatMap((m) => m.labelIds ?? []))
      );
      const isUnread = labelIds.includes("UNREAD");

      const lastDateMs = lastMsg?.internalDate
        ? parseInt(lastMsg.internalDate, 10)
        : Date.now();

      return EntityInput.create(GmailThread.ref(thread.id), {
        subject: extractHeader(lastPayload, "Subject"),
        snippet: thread.snippet,
        lastMessageDate: new Date(lastDateMs),
        messageCount: messages.length,
        participants: JSON.stringify(participants),
        labelIds: JSON.stringify(labelIds),
        isUnread,
      });
    });

    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GmailMailboxResolver = Resolver.for(GmailMailbox, {
  labels: MailboxLabelsLoader.field(),
  threads: MailboxThreadsLoader.field(),
});

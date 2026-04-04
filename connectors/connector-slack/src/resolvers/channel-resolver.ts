/**
 * SlackChannel Resolver — loads messages for a channel.
 */

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { SlackChannel, SlackMessage } from "../entities.js";
import { SlackAppContext } from "../context.js";
import { ListMessages } from "../operations.js";

export const ChannelMessagesLoader = Loader.collection({
  name: "slack:channel:messages",
  context: SlackAppContext,
  entity: SlackChannel,
  target: SlackMessage,

  async load(ref, _page, env) {
    const messages = await env.ops.execute(ListMessages, { channelId: ref.id });

    const items = messages.map((msg) => {
      // Composite ID: channel + timestamp to ensure global uniqueness
      const id = `${ref.id}:${msg.ts}`;
      const isThreadParent =
        msg.thread_ts === msg.ts && (msg.reply_count ?? 0) > 0;

      return EntityInput.create(SlackMessage.ref(id), {
        text: msg.text,
        authorId: msg.user ?? msg.bot_id ?? "",
        timestamp: msg.ts,
        threadTimestamp: msg.thread_ts ?? "",
        replyCount: msg.reply_count ?? 0,
        isThreadParent,
        reactions: JSON.stringify(msg.reactions ?? []),
      });
    });

    return Page.from(items, false, undefined);
  },
});

export const SlackChannelResolver = Resolver.for(SlackChannel, {
  messages: ChannelMessagesLoader.field(),
});

/**
 * SlackWorkspace Resolver — loads users and channels for the workspace.
 */

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { SlackWorkspace, SlackUser, SlackChannel } from "../entities.js";
import { SlackAppContext } from "../context.js";
import { ListUsers, ListChannels } from "../operations.js";

// ============================================================================
// Users
// ============================================================================

export const WorkspaceUsersLoader = Loader.collection({
  name: "slack:workspace:users",
  context: SlackAppContext,
  entity: SlackWorkspace,
  target: SlackUser,

  async load(_ref, _page, env) {
    const users = await env.ops.execute(ListUsers, {});

    // Filter out bots and deactivated accounts
    const human = users.filter((u) => !u.is_bot && u.name !== "slackbot");

    const items = human.map((u) =>
      EntityInput.create(SlackUser.ref(u.id), {
        name: u.name,
        displayName: u.profile?.display_name ?? u.real_name ?? u.name,
        email: u.profile?.email ?? "",
        isBot: false,
        isAdmin: u.is_admin ?? false,
        timezone: u.tz ?? "",
        avatarUrl: u.profile?.image_72 ?? "",
      })
    );

    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Channels
// ============================================================================

export const WorkspaceChannelsLoader = Loader.collection({
  name: "slack:workspace:channels",
  context: SlackAppContext,
  entity: SlackWorkspace,
  target: SlackChannel,

  async load(_ref, _page, env) {
    const types =
      env.ctx.channelTypes === "all"
        ? "public_channel,private_channel"
        : env.ctx.channelTypes;

    const channels = await env.ops.execute(ListChannels, {});

    const items = channels.map((ch) =>
      EntityInput.create(SlackChannel.ref(ch.id), {
        name: ch.name,
        topic: ch.topic?.value ?? "",
        purpose: ch.purpose?.value ?? "",
        isPrivate: ch.is_private,
        isArchived: ch.is_archived,
        memberCount: ch.num_members ?? 0,
      })
    );

    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const SlackWorkspaceResolver = Resolver.for(SlackWorkspace, {
  users: WorkspaceUsersLoader.field(),
  channels: WorkspaceChannelsLoader.field(),
});

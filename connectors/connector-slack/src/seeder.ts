/**
 * SlackSeeder — cold-start bootstrapper for the Slack connector.
 *
 * Sync order:
 *   1. Store root → load workspace (team info)
 *   2. Load workspace fields (name, domain, icon)
 *   3. Discover users and channels in parallel
 *   4. Load channel fields (name, topic, purpose, counts)
 *   5. Load message history per channel (most expensive step — done last)
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import {
  SlackRoot,
  SlackWorkspace,
  SlackUser,
  SlackChannel,
} from "./entities.js";
import { SlackAppContext } from "./context.js";

export const SlackSeeder = Seeder.create({
  context: SlackAppContext,

  async seed(env) {
    const rootRef = SlackRoot.ref("root");
    await env.engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Resolve the single workspace from root
      Step.forRoot(rootRef).loadFields("workspace"),

      // 2. Load workspace scalar fields
      Step.forAll(SlackWorkspace).loadFields("name", "domain", "iconUrl"),

      // 3. Discover users and channels in parallel (independent)
      Step.concurrent([
        Step.forAll(SlackWorkspace).loadCollection("users"),
        Step.forAll(SlackWorkspace).loadCollection("channels"),
      ]),

      // 4. Load user and channel fields
      Step.concurrent([
        Step.forAll(SlackUser).loadFields(
          "name",
          "displayName",
          "email",
          "isBot",
          "isAdmin",
          "timezone",
          "avatarUrl"
        ),
        Step.forAll(SlackChannel).loadFields(
          "name",
          "topic",
          "purpose",
          "isPrivate",
          "isArchived",
          "memberCount"
        ),
      ]),

      // 5. Sync message history (sequential — most API-intensive step)
      Step.forAll(SlackChannel).loadCollection("messages"),
    ]);
  },
});

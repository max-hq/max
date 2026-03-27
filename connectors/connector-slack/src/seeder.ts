/**
 * SlackSeeder — cold-start bootstrapper for the Slack connector.
 *
 * Uses auth.test (no extra scopes needed) to get workspace metadata,
 * creates the workspace entity, then discovers users, channels, and messages.
 *
 * Sync order:
 *   1. Discover users and channels in parallel
 *      — both loaders eagerly populate all scalar fields
 *   2. Load message history per channel (most expensive step — done last)
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { SlackWorkspace, SlackChannel } from "./entities.js";
import { SlackAppContext } from "./context.js";

export const SlackSeeder = Seeder.create({
  context: SlackAppContext,

  async seed(env) {
    // auth.test is always available and returns workspace name/url without team:read scope.
    const auth = await env.ctx.api.client.getAuthInfo();
    // Derive domain from the workspace URL (e.g. "https://acmecorp.slack.com/" → "acmecorp")
    const domain = auth.teamUrl.replace("https://", "").split(".")[0] ?? auth.teamId;

    const workspaceRef = SlackWorkspace.ref(auth.teamId);
    await env.engine.store(EntityInput.create(workspaceRef, {
      name: auth.teamName,
      domain,
      iconUrl: "",
    }));

    return SyncPlan.create([
      // 1. Discover users and channels in parallel.
      // Both loaders populate all scalar fields eagerly.
      Step.concurrent([
        Step.forRoot(workspaceRef).loadCollection("users"),
        Step.forRoot(workspaceRef).loadCollection("channels"),
      ]),

      // 2. Sync message history — most API-intensive step, done after all refs settled.
      Step.forAll(SlackChannel).loadCollection("messages"),
    ]);
  },
});

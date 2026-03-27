/**
 * GmailSeeder — cold-start bootstrapper for the Gmail connector.
 *
 * Sync order:
 *   1. Store root → resolve mailbox (profile)
 *   2. Load mailbox scalar fields
 *   3. Discover labels and thread list in parallel
 *   4. Load thread fields (fetches full thread bodies — most expensive step)
 *   5. Materialise individual messages per thread
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { GmailRoot, GmailMailbox, GmailThread } from "./entities.js";
import { GmailAppContext } from "./context.js";

export const GmailSeeder = Seeder.create({
  context: GmailAppContext,

  async seed(env) {
    const rootRef = GmailRoot.ref("root");
    await env.engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Resolve the mailbox from root
      Step.forRoot(rootRef).loadFields("mailbox"),

      // 2. Load mailbox scalar fields
      Step.forAll(GmailMailbox).loadFields("emailAddress", "displayName"),

      // 3. Discover labels and threads in parallel
      // Labels are cheap; thread list pagination can be concurrent
      Step.concurrent([
        Step.forAll(GmailMailbox).loadCollection("labels"),
        Step.forAll(GmailMailbox).loadCollection("threads"),
      ]),

      // 4. Load thread fields (fetches full thread + metadata)
      Step.forAll(GmailThread).loadFields(
        "subject",
        "snippet",
        "lastMessageDate",
        "messageCount",
        "participants",
        "labelIds",
        "isUnread"
      ),

      // 5. Materialise individual messages (re-uses cached thread from step 4)
      Step.forAll(GmailThread).loadCollection("messages"),
    ]);
  },
});

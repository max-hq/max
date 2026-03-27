/**
 * GmailSeeder — cold-start bootstrapper for the Gmail connector.
 *
 * Creates the mailbox entity directly from context (emailAddress from config),
 * then returns a plan to discover labels, threads, and messages.
 *
 * Sync order:
 *   1. Discover labels and thread list in parallel
 *      — threads are eagerly populated with all scalar fields by MailboxThreadsLoader
 *   2. Materialise individual messages per thread
 *      — re-uses thread data cached from step 1
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { GmailMailbox, GmailThread } from "./entities.js";
import { GmailAppContext } from "./context.js";

export const GmailSeeder = Seeder.create({
  context: GmailAppContext,

  async seed(env) {
    // Create the mailbox entity directly from config — emailAddress is set during onboarding.
    const mailboxRef = GmailMailbox.ref(env.ctx.emailAddress);
    await env.engine.store(EntityInput.create(mailboxRef, {
      emailAddress: env.ctx.emailAddress,
      displayName: env.ctx.emailAddress,
    }));

    return SyncPlan.create([
      // 1. Discover labels and threads in parallel.
      // MailboxThreadsLoader fetches full thread data (all scalar fields) eagerly.
      Step.concurrent([
        Step.forRoot(mailboxRef).loadCollection("labels"),
        Step.forRoot(mailboxRef).loadCollection("threads"),
      ]),

      // 2. Materialise individual messages per thread.
      // ThreadMessagesLoader re-uses thread data already fetched in step 1.
      Step.forAll(GmailThread).loadCollection("messages"),
    ]);
  },
});

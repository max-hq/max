/**
 * GmailRoot Resolver — entry point, loads the single mailbox.
 */

import { Loader, Resolver, EntityInput } from "@max/core";
import { GmailRoot, GmailMailbox } from "../entities.js";
import { GmailAppContext } from "../context.js";
import { GetProfile } from "../operations.js";

export const RootMailboxLoader = Loader.ref({
  name: "gmail:root:mailbox",
  context: GmailAppContext,
  entity: GmailRoot,
  target: GmailMailbox,

  async load(_ref, env) {
    const profile = await env.ops.execute(GetProfile, {});
    return EntityInput.create(GmailMailbox.ref(profile.emailAddress), {
      emailAddress: profile.emailAddress,
      displayName: profile.emailAddress,
    });
  },
});

export const GmailRootResolver = Resolver.for(GmailRoot, {
  mailbox: RootMailboxLoader.field(),
});

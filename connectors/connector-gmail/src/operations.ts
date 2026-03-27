/**
 * Gmail Operations — named, typed wrappers around Gmail REST API calls.
 *
 * Quota budget per operation type:
 *   GmailMeta: profile + labels (low cost, few calls)
 *   GmailList: thread list pagination (5 units/call)
 *   GmailFetch: full thread fetch (10 units/call — concurrency limited tightly)
 */

import { Operation, Limit } from "@max/core";
import { GmailAppContext } from "./context.js";
import type {
  GmailProfile,
  GmailApiLabel,
  GmailApiThread,
} from "./gmail-client.js";

const GmailMeta = Limit.concurrent("gmail:meta", 5);
const GmailList = Limit.concurrent("gmail:list", 5);
const GmailFetch = Limit.concurrent("gmail:fetch", 10);

// ============================================================================
// Profile
// ============================================================================

export const GetProfile = Operation.define({
  name: "gmail:profile:get",
  context: GmailAppContext,
  limit: GmailMeta,
  async handle(_input: {}, env): Promise<GmailProfile> {
    return env.ctx.api.client.getProfile();
  },
});

// ============================================================================
// Labels
// ============================================================================

export const ListLabels = Operation.define({
  name: "gmail:label:list",
  context: GmailAppContext,
  limit: GmailMeta,
  async handle(_input: {}, env): Promise<GmailApiLabel[]> {
    return env.ctx.api.client.listLabels();
  },
});

export const GetLabel = Operation.define({
  name: "gmail:label:get",
  context: GmailAppContext,
  limit: GmailMeta,
  async handle(input: { labelId: string }, env): Promise<GmailApiLabel> {
    return env.ctx.api.client.getLabelDetails(input.labelId);
  },
});

// ============================================================================
// Threads
// ============================================================================

export const ListThreads = Operation.define({
  name: "gmail:thread:list",
  context: GmailAppContext,
  limit: GmailList,
  async handle(_input: {}, env): Promise<GmailApiThread[]> {
    return env.ctx.api.client.listThreads({
      labelIds: env.ctx.labelFilter,
      maxResults: env.ctx.maxThreads,
      includeSpamTrash: env.ctx.includeSpamTrash,
    });
  },
});

export const GetThread = Operation.define({
  name: "gmail:thread:get",
  context: GmailAppContext,
  limit: GmailFetch,
  async handle(input: { threadId: string }, env): Promise<GmailApiThread> {
    return env.ctx.api.client.getThread(input.threadId);
  },
});

// ============================================================================
// All operations
// ============================================================================

export const GmailOperations = [
  GetProfile,
  ListLabels,
  GetLabel,
  ListThreads,
  GetThread,
] as const;

import { Operation, Limit } from "@max/core";
import { FathomAppContext } from "./context.js";
import type { FathomListResponse } from "./fathom-client.js";

const FathomApi = Limit.concurrent("fathom:api", 5);

// ============================================================================
// Recording operations
// ============================================================================

export const ListRecordings = Operation.define({
  name: "fathom:recording:list",
  context: FathomAppContext,
  limit: FathomApi,
  async handle(
    input: { maxPages?: number; cursor?: string },
    env,
  ): Promise<FathomListResponse> {
    return env.ctx.api.client.listMeetings({
      maxPages: input.maxPages ?? env.ctx.maxPages,
      cursor: input.cursor,
      includeSummary: true,
      includeActionItems: true,
    });
  },
});

export const GetTranscript = Operation.define({
  name: "fathom:transcript:get",
  context: FathomAppContext,
  limit: FathomApi,
  async handle(input: { recordingId: number }, env): Promise<string> {
    return env.ctx.api.client.getMeetingTranscript(input.recordingId);
  },
});

export const GetSummary = Operation.define({
  name: "fathom:summary:get",
  context: FathomAppContext,
  limit: FathomApi,
  async handle(input: { recordingId: number }, env): Promise<string> {
    return env.ctx.api.client.getMeetingSummary(input.recordingId);
  },
});

// ============================================================================
// All operations (for ConnectorDef registration)
// ============================================================================

export const FathomOperations = [
  ListRecordings,
  GetTranscript,
  GetSummary,
] as const;

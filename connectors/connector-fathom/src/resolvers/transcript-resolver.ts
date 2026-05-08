import { Loader, Resolver, EntityInput } from "@max/core";
import { FathomTranscript } from "../entities.js";
import { FathomAppContext } from "../context.js";
import { GetTranscript } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const TranscriptLoader = Loader.entity({
  name: "fathom:transcript:basic",
  context: FathomAppContext,
  entity: FathomTranscript,
  strategy: "autoload",

  async load(ref, env) {
    const recordingId = ref.id.replace("transcript:", "");
    const content = await env.ops.execute(GetTranscript, {
      recordingId: parseInt(recordingId, 10),
    });
    return EntityInput.create(ref, { content });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const FathomTranscriptResolver = Resolver.for(FathomTranscript, {
  content: TranscriptLoader.field("content"),
});

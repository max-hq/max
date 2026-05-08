import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { FathomRoot, FathomRecording } from "../entities.js";
import { FathomAppContext } from "../context.js";
import { ListRecordings } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const RootRecordingsLoader = Loader.collection({
  name: "fathom:root:recordings",
  context: FathomAppContext,
  entity: FathomRoot,
  target: FathomRecording,

  async load(ref, page, env) {
    const result = await env.ops.execute(ListRecordings, {});
    const items = result.meetings.map((m) =>
      EntityInput.create(FathomRecording.ref(String(m.recording_id)), {
        title: m.title,
        date: m.date ? new Date(m.date) : undefined,
        url: m.url,
        recordedBy: m.recorded_by,
        summary: m.summary ?? "",
      }),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const FathomRootResolver = Resolver.for(FathomRoot, {
  recordings: RootRecordingsLoader.field(),
});

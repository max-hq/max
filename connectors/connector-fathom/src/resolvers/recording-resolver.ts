import { Loader, Resolver, EntityInput, Page } from "@max/core";
import {
  FathomRecording,
  FathomParticipant,
  FathomActionItem,
  FathomTranscript,
} from "../entities.js";
import { FathomAppContext } from "../context.js";
import { ListRecordings, GetTranscript } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const RecordingBasicLoader = Loader.entity({
  name: "fathom:recording:basic",
  context: FathomAppContext,
  entity: FathomRecording,
  strategy: "autoload",

  async load(ref, env) {
    const result = await env.ops.execute(ListRecordings, { maxPages: 1 });
    const meeting = result.meetings.find((m) => String(m.recording_id) === ref.id);
    if (!meeting) {
      return EntityInput.create(ref, {});
    }
    return EntityInput.create(ref, {
      title: meeting.title,
      date: meeting.date ? new Date(meeting.date) : undefined,
      url: meeting.url,
      recordedBy: meeting.recorded_by,
      summary: meeting.summary ?? "",
      transcript: FathomTranscript.ref(`transcript:${ref.id}`),
    });
  },
});

export const RecordingParticipantsLoader = Loader.collection({
  name: "fathom:recording:participants",
  context: FathomAppContext,
  entity: FathomRecording,
  target: FathomParticipant,

  async load(ref, page, env) {
    const result = await env.ops.execute(ListRecordings, { maxPages: 1 });
    const meeting = result.meetings.find((m) => String(m.recording_id) === ref.id);
    if (!meeting) return Page.from([], false, undefined);

    const items = meeting.participants.map((p, i) => {
      const isEmail = p.includes("@");
      return EntityInput.create(
        FathomParticipant.ref(`${ref.id}:participant:${i}`),
        {
          name: isEmail ? "" : p,
          email: isEmail ? p : "",
        },
      );
    });
    return Page.from(items, false, undefined);
  },
});

export const RecordingActionItemsLoader = Loader.collection({
  name: "fathom:recording:action-items",
  context: FathomAppContext,
  entity: FathomRecording,
  target: FathomActionItem,

  async load(ref, page, env) {
    const result = await env.ops.execute(ListRecordings, { maxPages: 1 });
    const meeting = result.meetings.find((m) => String(m.recording_id) === ref.id);
    if (!meeting?.action_items) return Page.from([], false, undefined);

    const items = meeting.action_items.map((ai, i) =>
      EntityInput.create(
        FathomActionItem.ref(`${ref.id}:action:${i}`),
        {
          description: ai.description,
          assignee: ai.assignee,
          timestampUrl: ai.timestamp_url,
        },
      ),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const FathomRecordingResolver = Resolver.for(FathomRecording, {
  title: RecordingBasicLoader.field("title"),
  date: RecordingBasicLoader.field("date"),
  url: RecordingBasicLoader.field("url"),
  recordedBy: RecordingBasicLoader.field("recordedBy"),
  summary: RecordingBasicLoader.field("summary"),
  transcript: RecordingBasicLoader.field("transcript"),
  participants: RecordingParticipantsLoader.field(),
  actionItems: RecordingActionItemsLoader.field(),
});

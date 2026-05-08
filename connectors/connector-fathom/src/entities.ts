import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// FathomParticipant (leaf)
// ============================================================================

export interface FathomParticipant extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}

export const FathomParticipant: FathomParticipant = EntityDef.create("FathomParticipant", {
  name: Field.string(),
  email: Field.string(),
});

// ============================================================================
// FathomActionItem (leaf)
// ============================================================================

export interface FathomActionItem extends EntityDef<{
  description: ScalarField<"string">;
  assignee: ScalarField<"string">;
  timestampUrl: ScalarField<"string">;
}> {}

export const FathomActionItem: FathomActionItem = EntityDef.create("FathomActionItem", {
  description: Field.string(),
  assignee: Field.string(),
  timestampUrl: Field.string(),
});

// ============================================================================
// FathomTranscript (leaf)
// ============================================================================

export interface FathomTranscript extends EntityDef<{
  content: ScalarField<"string">;
}> {}

export const FathomTranscript: FathomTranscript = EntityDef.create("FathomTranscript", {
  content: Field.string(),
});

// ============================================================================
// FathomRecording (refs FathomTranscript, collections of Participant + ActionItem)
// ============================================================================

export interface FathomRecording extends EntityDef<{
  title: ScalarField<"string">;
  date: ScalarField<"date">;
  url: ScalarField<"string">;
  recordedBy: ScalarField<"string">;
  summary: ScalarField<"string">;
  participants: CollectionField<FathomParticipant>;
  actionItems: CollectionField<FathomActionItem>;
  transcript: RefField<FathomTranscript>;
}> {}

export const FathomRecording: FathomRecording = EntityDef.create("FathomRecording", {
  title: Field.string(),
  date: Field.date(),
  url: Field.string(),
  recordedBy: Field.string(),
  summary: Field.string(),
  participants: Field.collection(FathomParticipant),
  actionItems: Field.collection(FathomActionItem),
  transcript: Field.ref(FathomTranscript),
});

// ============================================================================
// FathomRoot (singleton — collection of FathomRecording)
// ============================================================================

export interface FathomRoot extends EntityDef<{
  recordings: CollectionField<FathomRecording>;
}> {}

export const FathomRoot: FathomRoot = EntityDef.create("FathomRoot", {
  recordings: Field.collection(FathomRecording),
});

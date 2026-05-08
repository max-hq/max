import { Schema } from "@max/core";
import {
  FathomRoot,
  FathomRecording,
  FathomParticipant,
  FathomActionItem,
  FathomTranscript,
} from "./entities.js";

export const FathomSchema = Schema.create({
  namespace: "fathom",
  entities: [FathomRoot, FathomRecording, FathomParticipant, FathomActionItem, FathomTranscript],
  roots: [FathomRoot],
});

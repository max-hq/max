import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import {
  FathomRoot,
  FathomRecording,
  FathomTranscript,
} from "./entities.js";
import { FathomAppContext } from "./context.js";

export const FathomSeeder = Seeder.create({
  context: FathomAppContext,

  async seed(env) {
    const rootRef = FathomRoot.ref("root");
    await env.engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all recordings from root (includes metadata, summary, action items)
      Step.forRoot(rootRef).loadCollection("recordings"),
      // 2. Load recording fields (populates title, date, url, recordedBy, summary, transcript ref)
      Step.forAll(FathomRecording).loadFields(
        "title", "date", "url", "recordedBy", "summary", "transcript",
      ),
      // 3. Discover participants and action items per recording
      Step.forAll(FathomRecording).loadCollection("participants"),
      Step.forAll(FathomRecording).loadCollection("actionItems"),
      // 4. Load transcript content
      Step.forAll(FathomTranscript).loadFields("content"),
    ]);
  },
});

export {
  FathomRoot,
  FathomRecording,
  FathomParticipant,
  FathomActionItem,
  FathomTranscript,
} from "./entities.js";
export { FathomAppContext } from "./context.js";
export { FathomConnection, type FathomClientProvider } from "./fathom-client.js";
export { FathomRootResolver } from "./resolvers/root-resolver.js";
export { FathomRecordingResolver } from "./resolvers/recording-resolver.js";
export { FathomTranscriptResolver } from "./resolvers/transcript-resolver.js";
export { FathomParticipantResolver } from "./resolvers/participant-resolver.js";
export { FathomActionItemResolver } from "./resolvers/action-item-resolver.js";
export { FathomSeeder } from "./seeder.js";
export { FathomSchema } from "./schema.js";
export { FathomApiToken } from "./credentials.js";
export { FathomOnboarding } from "./onboarding.js";
export type { FathomConfig } from "./config.js";

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { FathomOperations } from "./operations.js";
import { FathomSchema } from "./schema.js";
import { FathomSeeder } from "./seeder.js";
import { FathomRootResolver } from "./resolvers/root-resolver.js";
import { FathomRecordingResolver } from "./resolvers/recording-resolver.js";
import { FathomTranscriptResolver } from "./resolvers/transcript-resolver.js";
import { FathomParticipantResolver } from "./resolvers/participant-resolver.js";
import { FathomActionItemResolver } from "./resolvers/action-item-resolver.js";
import { FathomOnboarding } from "./onboarding.js";
import { FathomAppContext } from "./context.js";
import { FathomConnection } from "./fathom-client.js";
import { FathomApiToken } from "./credentials.js";
import type { FathomConfig } from "./config.js";

const FathomDef = ConnectorDef.create<FathomConfig>({
  name: "fathom",
  displayName: "Fathom",
  description: "Meeting intelligence connector — syncs Fathom recordings, transcripts, and summaries",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: FathomSchema,
  onboarding: FathomOnboarding,
  seeder: FathomSeeder,
  resolvers: [
    FathomRootResolver,
    FathomRecordingResolver,
    FathomTranscriptResolver,
    FathomParticipantResolver,
    FathomActionItemResolver,
  ],
  operations: [...FathomOperations],
});

const FathomConnector = ConnectorModule.create<FathomConfig>({
  def: FathomDef,
  initialise(config, platform) {
    const tokenHandle = platform.credentials.get(FathomApiToken);
    const api = new FathomConnection(config, tokenHandle);

    const ctx = Context.build(FathomAppContext, {
      api,
      maxPages: config.maxPages ?? 5,
    });

    return Installation.create({
      context: ctx,
      async start() {
        await api.start();
        platform.credentials.startRefreshSchedulers();
      },
      async stop() {
        platform.credentials.stopRefreshSchedulers();
      },
      async health() {
        const result = await api.health();
        return result.ok
          ? { status: "healthy" }
          : { status: "unhealthy", reason: result.error ?? "Unknown error" };
      },
    });
  },
});

export default FathomConnector;

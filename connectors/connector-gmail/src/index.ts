/**
 * @max/connector-gmail
 *
 * Syncs Gmail threads, messages, labels, and mailbox metadata into local SQLite.
 *
 * Required OAuth scope: https://www.googleapis.com/auth/gmail.readonly
 */

// Public exports
export {
  GmailRoot,
  GmailMailbox,
  GmailLabel,
  GmailThread,
  GmailMessage,
} from "./entities.js";
export { GmailAppContext } from "./context.js";
export { GmailClient } from "./gmail-client.js";
export type { GmailClientProvider } from "./gmail-client.js";
export { GmailSchema } from "./schema.js";
export { GmailAccessToken, GmailRefreshToken } from "./credentials.js";
export { GmailOnboarding } from "./onboarding.js";
export { GmailSeeder } from "./seeder.js";
export { GmailRootResolver } from "./resolvers/root-resolver.js";
export { GmailMailboxResolver } from "./resolvers/mailbox-resolver.js";
export { GmailThreadResolver } from "./resolvers/thread-resolver.js";
export type { GmailConfig } from "./config.js";

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { GmailOperations } from "./operations.js";
import { GmailSchema } from "./schema.js";
import { GmailSeeder } from "./seeder.js";
import { GmailRootResolver } from "./resolvers/root-resolver.js";
import { GmailMailboxResolver } from "./resolvers/mailbox-resolver.js";
import { GmailThreadResolver } from "./resolvers/thread-resolver.js";
import { GmailOnboarding } from "./onboarding.js";
import { GmailAppContext } from "./context.js";
import { GmailClient } from "./gmail-client.js";
import { GmailAccessToken, GmailRefreshToken } from "./credentials.js";
import type { GmailConfig } from "./config.js";

const GmailDef = ConnectorDef.create<GmailConfig>({
  name: "gmail",
  displayName: "Gmail",
  description: "Syncs Gmail threads, messages, labels, and mailbox metadata",
  icon: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
  version: "0.1.0",
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  schema: GmailSchema,
  onboarding: GmailOnboarding,
  seeder: GmailSeeder,
  resolvers: [
    GmailRootResolver,
    GmailMailboxResolver,
    GmailThreadResolver,
  ],
  operations: [...GmailOperations],
});

const GmailConnector = ConnectorModule.create<GmailConfig>({
  def: GmailDef,
  initialise(config, platform) {
    const accessTokenHandle = platform.credentials.get(GmailAccessToken);
    const _refreshTokenHandle = platform.credentials.get(GmailRefreshToken);

    const clientProvider = {
      get client() {
        return new GmailClient(() => accessTokenHandle.value);
      },
    };

    const ctx = Context.build(GmailAppContext, {
      api: clientProvider,
      emailAddress: config.emailAddress,
      maxThreads: config.maxThreads ?? 2000,
      labelFilter: config.labelFilter ?? ["INBOX", "SENT"],
      includeSpamTrash: config.includeSpamTrash ?? false,
    });

    return Installation.create({
      context: ctx,
      async start() {
        platform.credentials.startRefreshSchedulers();
      },
      async stop() {
        platform.credentials.stopRefreshSchedulers();
      },
      async health() {
        try {
          await clientProvider.client.getProfile();
          return { status: "healthy" };
        } catch (err) {
          return {
            status: "unhealthy",
            reason: err instanceof Error ? err.message : "Unknown error",
          };
        }
      },
    });
  },
});

export default GmailConnector;

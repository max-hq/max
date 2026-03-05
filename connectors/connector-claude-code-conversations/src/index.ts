/**
 * @max/connector-claude-code-conversations — Reads Claude Code conversation
 * data from the local filesystem (~/.claude/projects/).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { ConversationsSchema } from "./schema.js";
import { ConversationsSeeder } from "./seeder.js";
import { RootResolver } from "./resolvers/root-resolver.js";
import { ProjectResolver } from "./resolvers/project-resolver.js";
import { SessionResolver } from "./resolvers/session-resolver.js";
import { MessageResolver } from "./resolvers/message-resolver.js";
import { ConversationsOnboarding } from "./onboarding.js";
import { ConversationsContext } from "./context.js";
import { ConversationsClient } from "./conversations-client.js";
import type { ConversationsConfig } from "./config.js";

// ============================================================================
// Named exports
// ============================================================================

export { Root, Project, Session, Message } from "./entities.js";
export { ConversationsContext } from "./context.js";
export { ConversationsClient } from "./conversations-client.js";
export { RootResolver } from "./resolvers/root-resolver.js";
export { ProjectResolver } from "./resolvers/project-resolver.js";
export { SessionResolver } from "./resolvers/session-resolver.js";
export { MessageResolver } from "./resolvers/message-resolver.js";
export { ConversationsSeeder } from "./seeder.js";
export { ConversationsSchema } from "./schema.js";
export { ConversationsOnboarding } from "./onboarding.js";
export type { ConversationsConfig } from "./config.js";

// ============================================================================
// ConnectorDef
// ============================================================================

const ConversationsDef = ConnectorDef.create<ConversationsConfig>({
  name: "claude-code-conversations",
  displayName: "Claude Code Conversations",
  description: "Reads Claude Code conversation history from the local filesystem",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: ConversationsSchema,
  onboarding: ConversationsOnboarding,
  seeder: ConversationsSeeder,
  resolvers: [
    RootResolver,
    ProjectResolver,
    SessionResolver,
    MessageResolver,
  ],
});

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

const ConversationsConnector = ConnectorModule.create<ConversationsConfig>({
  def: ConversationsDef,
  initialise(config, _credentials) {
    const claudeDir = config.claudeDir || DEFAULT_CLAUDE_DIR;
    const client = new ConversationsClient(claudeDir);

    const ctx = Context.build(ConversationsContext, { client });

    return Installation.create({
      context: ctx,
      async health() {
        const result = await client.health();
        return result.ok
          ? { status: "healthy" }
          : { status: "unhealthy", reason: result.error ?? "Unknown error" };
      },
    });
  },
});

export default ConversationsConnector;

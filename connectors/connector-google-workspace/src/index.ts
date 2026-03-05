import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { GoogleWorkspaceSchema } from "./schema.js";
import { GoogleWorkspaceSeeder } from "./seeder.js";
import { DirectoryResolver } from "./resolvers/directory-resolver.js";
import { UserResolver } from "./resolvers/user-resolver.js";
import { GroupResolver } from "./resolvers/group-resolver.js";
import { GroupMemberResolver } from "./resolvers/group-member-resolver.js";
import { OrgUnitResolver } from "./resolvers/org-unit-resolver.js";
import { GoogleWorkspaceOnboarding } from "./onboarding.js";
import { GoogleWorkspaceContext } from "./context.js";
import { GoogleWorkspaceClient } from "./google-workspace-client.js";
import { ServiceAccountKey } from "./credentials.js";
import type { GoogleWorkspaceConfig } from "./config.js";

// ============================================================================
// ConnectorDef
// ============================================================================

const GoogleWorkspaceDef = ConnectorDef.create<GoogleWorkspaceConfig>({
  name: "google-workspace",
  displayName: "Google Workspace",
  description: "Sync users, groups, org units, and memberships from Google Admin Directory",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: GoogleWorkspaceSchema,
  onboarding: GoogleWorkspaceOnboarding,
  seeder: GoogleWorkspaceSeeder,
  resolvers: [
    DirectoryResolver,
    UserResolver,
    GroupResolver,
    GroupMemberResolver,
    OrgUnitResolver,
  ],
});

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

const GoogleWorkspaceConnector = ConnectorModule.create<GoogleWorkspaceConfig>({
  def: GoogleWorkspaceDef,
  initialise(config, credentials) {
    const keyHandle = credentials.get(ServiceAccountKey);
    const api = new GoogleWorkspaceClient(
      keyHandle,
      config.adminEmail,
      config.domain,
      config.customerId,
    );

    const ctx = Context.build(GoogleWorkspaceContext, { api });

    return Installation.create({
      context: ctx,
      async start() {
        await api.start();
        credentials.startRefreshSchedulers();
      },
      async stop() {
        credentials.stopRefreshSchedulers();
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

export default GoogleWorkspaceConnector;

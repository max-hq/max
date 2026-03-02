/**
 * @max/connector-linear — Linear issue tracking connector.
 */

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { LinearSchema } from "./schema.js";
import { LinearSeeder } from "./seeder.js";
import { LinearOrganizationResolver } from "./resolvers/organization-resolver.js";
import { LinearTeamResolver } from "./resolvers/team-resolver.js";
import { LinearUserResolver } from "./resolvers/user-resolver.js";
import { LinearProjectResolver } from "./resolvers/project-resolver.js";
import { LinearIssueResolver } from "./resolvers/issue-resolver.js";
import { LinearOnboarding } from "./onboarding.js";
import { LinearContext } from "./context.js";
import { LinearClient } from "./linear-client.js";
import { LinearApiKey } from "./credentials.js";
import type { LinearConfig } from "./config.js";

// ============================================================================
// ConnectorDef
// ============================================================================

const LinearDef = ConnectorDef.create<LinearConfig>({
  name: "linear",
  displayName: "Linear",
  description: "Issue tracking and project management powered by Linear",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: LinearSchema,
  onboarding: LinearOnboarding,
  seeder: LinearSeeder,
  resolvers: [
    LinearOrganizationResolver,
    LinearTeamResolver,
    LinearUserResolver,
    LinearProjectResolver,
    LinearIssueResolver,
  ],
});

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

const LinearConnector = ConnectorModule.create<LinearConfig>({
  def: LinearDef,
  initialise(_config, credentials) {
    const tokenHandle = credentials.get(LinearApiKey);
    const api = new LinearClient(tokenHandle);

    const ctx = Context.build(LinearContext, { api });

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

export default LinearConnector;

/**
 * LinearSeeder — Cold-start bootstrapper for the Linear connector.
 *
 * Creates the root organization entity and returns a plan to discover
 * teams, users, projects, and issues.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import {
  LinearOrganization,
  LinearTeam,
  LinearProject,
} from "./entities.js";
import { LinearContext } from "./context.js";

interface OrgResponse {
  organization: { id: string; name: string; urlKey: string };
}

export const LinearSeeder = Seeder.create({
  context: LinearContext,

  async seed(ctx, engine) {
    const { organization: org } = await ctx.api.graphql<OrgResponse>(
      `{ organization { id name urlKey } }`,
    );
    const orgRef = LinearOrganization.ref(org.id);
    await engine.store(EntityInput.create(orgRef, {
      name: org.name,
      urlKey: org.urlKey,
    }));

    return SyncPlan.create([
      // 1. Discover teams, users, and projects from the organization
      Step.forRoot(orgRef).loadCollection("teams"),
      Step.forRoot(orgRef).loadCollection("users"),
      Step.forRoot(orgRef).loadCollection("projects"),
      // 2. Discover team issues + members (team fields populated by OrgTeamsLoader)
      Step.forAll(LinearTeam).loadCollection("issues"),
      Step.forAll(LinearTeam).loadCollection("members"),
      // 3. Establish project→issue relationships (IDs only — field data from team loading)
      Step.forAll(LinearProject).loadCollection("issues"),
    ]);
  },
});

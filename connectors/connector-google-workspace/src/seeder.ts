import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { Directory, Group } from "./entities.js";
import { GoogleWorkspaceContext } from "./context.js";

export const GoogleWorkspaceSeeder = Seeder.create({
  context: GoogleWorkspaceContext,

  async seed(ctx, engine) {
    const dirRef = Directory.ref("root");
    await engine.store(
      EntityInput.create(dirRef, {
        domain: ctx.api.domain,
        customerId: ctx.api.customerId,
      }),
    );

    return SyncPlan.create([
      Step.forRoot(dirRef).loadCollection("users"),
      Step.forRoot(dirRef).loadCollection("groups"),
      Step.forRoot(dirRef).loadCollection("orgUnits"),
      Step.forAll(Group).loadCollection("members"),
    ]);
  },
});

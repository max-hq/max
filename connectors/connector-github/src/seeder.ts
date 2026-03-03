/**
 * GitHubSeeder - Cold-start bootstrapper for the GitHub connector.
 *
 * Creates the root repository entity and returns a plan to discover issues.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { GitHubRepository } from "./entities.js";
import { GitHubContext } from "./context.js";

export const GitHubSeeder = Seeder.create({
  context: GitHubContext,

  async seed(ctx, engine) {
    const repo = await ctx.api.getRepo();
    const repoRef = GitHubRepository.ref(String(repo.id));

    await engine.store(EntityInput.create(repoRef, {
      name: repo.name,
      description: repo.description ?? undefined,
      url: repo.html_url,
    }));

    return SyncPlan.create([
      Step.forRoot(repoRef).loadCollection("issues"),
    ]);
  },
});

/**
 * GitHubSeeder - Cold-start bootstrapper for the GitHub connector.
 *
 * Creates the root repository entity via GraphQL and returns a plan to
 * discover issues.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { GitHubRepository } from "./entities.js";
import { GitHubContext } from "./context.js";

interface SeedRepoResponse {
  repository: {
    id: string;
    name: string;
    description: string | null;
    url: string;
  };
}

export const GitHubSeeder = Seeder.create({
  context: GitHubContext,

  async seed(ctx, engine) {
    const data = await ctx.api.graphql<SeedRepoResponse>(
      `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id name description url
        }
      }`,
      { owner: ctx.api.owner, repo: ctx.api.repo },
    );

    const repo = data.repository;
    const repoRef = GitHubRepository.ref(repo.id);

    await engine.store(EntityInput.create(repoRef, {
      name: repo.name,
      description: repo.description ?? undefined,
      url: repo.url,
    }));

    return SyncPlan.create([
      Step.forRoot(repoRef).loadCollection("issues"),
    ]);
  },
});

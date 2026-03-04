/**
 * GitHub entity definitions.
 *
 * Ordered leaf-first to avoid forward references in const declarations.
 */

import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// GitHubUser (leaf — no refs)
// ============================================================================

export interface GitHubUser extends EntityDef<{
  login: ScalarField<"string">;
  avatarUrl: ScalarField<"string">;
  url: ScalarField<"string">;
}> {}

export const GitHubUser: GitHubUser = EntityDef.create("GitHubUser", {
  login: Field.string(),
  avatarUrl: Field.string(),
  url: Field.string(),
});

// ============================================================================
// GitHubIssue (refs GitHubUser — already defined above)
// ============================================================================

export interface GitHubIssue extends EntityDef<{
  number: ScalarField<"number">;
  title: ScalarField<"string">;
  body: ScalarField<"string">;
  state: ScalarField<"string">;
  labels: ScalarField<"string">;
  createdAt: ScalarField<"string">;
  updatedAt: ScalarField<"string">;
  author: RefField<GitHubUser>;
}> {}

export const GitHubIssue: GitHubIssue = EntityDef.create("GitHubIssue", {
  number: Field.number(),
  title: Field.string(),
  body: Field.string(),
  state: Field.string(),
  labels: Field.string(),
  createdAt: Field.string(),
  updatedAt: Field.string(),
  author: Field.ref(GitHubUser),
});

// ============================================================================
// GitHubRepository (root — collection of GitHubIssue)
// ============================================================================

export interface GitHubRepository extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  url: ScalarField<"string">;
  issues: CollectionField<GitHubIssue>;
  issueAuthors: CollectionField<GitHubUser>;
}> {}

export const GitHubRepository: GitHubRepository = EntityDef.create("GitHubRepository", {
  name: Field.string(),
  description: Field.string(),
  url: Field.string(),
  issues: Field.collection(GitHubIssue),
  issueAuthors: Field.collection(GitHubUser),
});

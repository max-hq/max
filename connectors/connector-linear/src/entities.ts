/**
 * Linear entity definitions.
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
// LinearUser (leaf — no refs)
// ============================================================================

export interface LinearUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  displayName: ScalarField<"string">;
  active: ScalarField<"boolean">;
  admin: ScalarField<"boolean">;
}> {}

export const LinearUser: LinearUser = EntityDef.create("LinearUser", {
  name: Field.string(),
  email: Field.string(),
  displayName: Field.string(),
  active: Field.boolean(),
  admin: Field.boolean(),
});

// ============================================================================
// LinearIssue (refs LinearUser — already defined above)
// ============================================================================

export interface LinearIssue extends EntityDef<{
  identifier: ScalarField<"string">;
  title: ScalarField<"string">;
  description: ScalarField<"string">;
  priority: ScalarField<"number">;
  state: ScalarField<"string">;
  assignee: RefField<LinearUser>;
  project: RefField<LinearProject>;
}> {}

export const LinearIssue: LinearIssue = EntityDef.create("LinearIssue", {
  identifier: Field.string(),
  title: Field.string(),
  description: Field.string(),
  priority: Field.number(),
  state: Field.string(),
  assignee: Field.ref(LinearUser),
  project: Field.refThunk(() => LinearProject)
});

// ============================================================================
// LinearProject (collection of LinearIssue — already defined above)
// ============================================================================

export interface LinearProject extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  state: ScalarField<"string">;
  progress: ScalarField<"number">;
  startDate: ScalarField<"string">;
  targetDate: ScalarField<"string">;
  issues: CollectionField<LinearIssue>;
}> {}

export const LinearProject: LinearProject = EntityDef.create("LinearProject", {
  name: Field.string(),
  description: Field.string(),
  state: Field.string(),
  progress: Field.number(),
  startDate: Field.string(),
  targetDate: Field.string(),
  issues: Field.collection(LinearIssue),
});

// ============================================================================
// LinearTeam (collections of LinearIssue, LinearUser — both defined above)
// ============================================================================

export interface LinearTeam extends EntityDef<{
  name: ScalarField<"string">;
  key: ScalarField<"string">;
  description: ScalarField<"string">;
  issues: CollectionField<LinearIssue>;
  members: CollectionField<LinearUser>;
}> {}

export const LinearTeam: LinearTeam = EntityDef.create("LinearTeam", {
  name: Field.string(),
  key: Field.string(),
  description: Field.string(),
  issues: Field.collection(LinearIssue),
  members: Field.collection(LinearUser),
});

// ============================================================================
// LinearOrganization (root — collections of LinearTeam, LinearUser, LinearProject)
// ============================================================================

export interface LinearOrganization extends EntityDef<{
  name: ScalarField<"string">;
  urlKey: ScalarField<"string">;
  teams: CollectionField<LinearTeam>;
  users: CollectionField<LinearUser>;
  projects: CollectionField<LinearProject>;
}> {}

export const LinearOrganization: LinearOrganization = EntityDef.create("LinearOrganization", {
  name: Field.string(),
  urlKey: Field.string(),
  teams: Field.collection(LinearTeam),
  users: Field.collection(LinearUser),
  projects: Field.collection(LinearProject),
});

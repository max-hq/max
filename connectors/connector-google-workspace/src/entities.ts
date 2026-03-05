import {
  EntityDef,
  Field,
  type ScalarField,
  type CollectionField,
} from "@max/core";

// -- Leaf entities (no refs to other entities) --

export interface OrgUnit
  extends EntityDef<{
    name: ScalarField<"string">;
    description: ScalarField<"string">;
    orgUnitPath: ScalarField<"string">;
    parentOrgUnitPath: ScalarField<"string">;
  }> {}

export const OrgUnit: OrgUnit = EntityDef.create("OrgUnit", {
  name: Field.string(),
  description: Field.string(),
  orgUnitPath: Field.string(),
  parentOrgUnitPath: Field.string(),
});

export interface User
  extends EntityDef<{
    email: ScalarField<"string">;
    name: ScalarField<"string">;
    givenName: ScalarField<"string">;
    familyName: ScalarField<"string">;
    isAdmin: ScalarField<"boolean">;
    suspended: ScalarField<"boolean">;
    orgUnitPath: ScalarField<"string">;
    creationTime: ScalarField<"date">;
    lastLoginTime: ScalarField<"date">;
  }> {}

export const User: User = EntityDef.create("User", {
  email: Field.string(),
  name: Field.string(),
  givenName: Field.string(),
  familyName: Field.string(),
  isAdmin: Field.boolean(),
  suspended: Field.boolean(),
  orgUnitPath: Field.string(),
  creationTime: Field.date(),
  lastLoginTime: Field.date(),
});

export interface GroupMember
  extends EntityDef<{
    email: ScalarField<"string">;
    role: ScalarField<"string">;
    type: ScalarField<"string">;
    status: ScalarField<"string">;
  }> {}

export const GroupMember: GroupMember = EntityDef.create("GroupMember", {
  email: Field.string(),
  role: Field.string(),
  type: Field.string(),
  status: Field.string(),
});

// -- Entities with collections --

export interface Group
  extends EntityDef<{
    email: ScalarField<"string">;
    name: ScalarField<"string">;
    description: ScalarField<"string">;
    directMembersCount: ScalarField<"number">;
    members: CollectionField<GroupMember>;
  }> {}

export const Group: Group = EntityDef.create("Group", {
  email: Field.string(),
  name: Field.string(),
  description: Field.string(),
  directMembersCount: Field.number(),
  members: Field.collection(GroupMember),
});

// -- Root entity --

export interface Directory
  extends EntityDef<{
    domain: ScalarField<"string">;
    customerId: ScalarField<"string">;
    users: CollectionField<User>;
    groups: CollectionField<Group>;
    orgUnits: CollectionField<OrgUnit>;
  }> {}

export const Directory: Directory = EntityDef.create("Directory", {
  domain: Field.string(),
  customerId: Field.string(),
  users: Field.collection(User),
  groups: Field.collection(Group),
  orgUnits: Field.collection(OrgUnit),
});

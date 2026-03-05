import { Schema } from "@max/core";
import { OrgUnit, User, GroupMember, Group, Directory } from "./entities.js";

export { OrgUnit, User, GroupMember, Group, Directory };

export const GoogleWorkspaceSchema = Schema.create({
  namespace: "google-workspace",
  entities: [OrgUnit, User, GroupMember, Group, Directory],
  roots: [Directory],
});

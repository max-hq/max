import { Loader, Resolver, EntityInput } from "@max/core";
import { GroupMember } from "../entities.js";
import { GoogleWorkspaceContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

// GroupMembers have no individual GET endpoint in the Admin Directory API.
// They are populated by the GroupMembersLoader collection loader.
// This entity loader serves as a fallback that returns empty data.
export const GroupMemberBasicLoader = Loader.entity({
  name: "google-workspace:group-member:basic",
  context: GoogleWorkspaceContext,
  entity: GroupMember,

  async load(ref) {
    return EntityInput.create(ref, {
      email: "",
      role: "",
      type: "",
      status: "",
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GroupMemberResolver = Resolver.for(GroupMember, {
  email: GroupMemberBasicLoader.field("email"),
  role: GroupMemberBasicLoader.field("role"),
  type: GroupMemberBasicLoader.field("type"),
  status: GroupMemberBasicLoader.field("status"),
});

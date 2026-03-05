import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { Group, GroupMember } from "../entities.js";
import { GoogleWorkspaceContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const GroupBasicLoader = Loader.entity({
  name: "google-workspace:group:basic",
  context: GoogleWorkspaceContext,
  entity: Group,
  strategy: "autoload",

  async load(ref, ctx) {
    const g = await ctx.api.getGroup(ref.id);
    return EntityInput.create(ref, {
      email: (g.email as string) ?? "",
      name: (g.name as string) ?? "",
      description: (g.description as string) ?? "",
      directMembersCount: parseInt(String(g.directMembersCount ?? "0"), 10) || 0,
    });
  },
});

export const GroupMembersLoader = Loader.collection({
  name: "google-workspace:group:members",
  context: GoogleWorkspaceContext,
  entity: Group,
  target: GroupMember,

  async load(ref, page, ctx) {
    const data = await ctx.api.listGroupMembers(ref.id, page.cursor);
    const items = (data.members as Record<string, unknown>[]).map((m) =>
      EntityInput.create(GroupMember.ref(m.id as string), {
        email: (m.email as string) ?? "",
        role: (m.role as string) ?? "",
        type: (m.type as string) ?? "",
        status: (m.status as string) ?? "",
      }),
    );
    return Page.from(items, !!data.nextPageToken, data.nextPageToken);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const GroupResolver = Resolver.for(Group, {
  email: GroupBasicLoader.field("email"),
  name: GroupBasicLoader.field("name"),
  description: GroupBasicLoader.field("description"),
  directMembersCount: GroupBasicLoader.field("directMembersCount"),
  members: GroupMembersLoader.field(),
});

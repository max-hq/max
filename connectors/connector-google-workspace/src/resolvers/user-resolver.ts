import { Loader, Resolver, EntityInput } from "@max/core";
import { User } from "../entities.js";
import { GoogleWorkspaceContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const UserBasicLoader = Loader.entity({
  name: "google-workspace:user:basic",
  context: GoogleWorkspaceContext,
  entity: User,
  strategy: "autoload",

  async load(ref, ctx) {
    const u = await ctx.api.getUser(ref.id);
    const name = u.name as Record<string, unknown> | undefined;
    return EntityInput.create(ref, {
      email: (u.primaryEmail as string) ?? "",
      name: (name?.fullName as string) ?? "",
      givenName: (name?.givenName as string) ?? "",
      familyName: (name?.familyName as string) ?? "",
      isAdmin: (u.isAdmin as boolean) ?? false,
      suspended: (u.suspended as boolean) ?? false,
      orgUnitPath: (u.orgUnitPath as string) ?? "",
      creationTime: u.creationTime ? new Date(u.creationTime as string) : undefined,
      lastLoginTime: u.lastLoginTime ? new Date(u.lastLoginTime as string) : undefined,
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const UserResolver = Resolver.for(User, {
  email: UserBasicLoader.field("email"),
  name: UserBasicLoader.field("name"),
  givenName: UserBasicLoader.field("givenName"),
  familyName: UserBasicLoader.field("familyName"),
  isAdmin: UserBasicLoader.field("isAdmin"),
  suspended: UserBasicLoader.field("suspended"),
  orgUnitPath: UserBasicLoader.field("orgUnitPath"),
  creationTime: UserBasicLoader.field("creationTime"),
  lastLoginTime: UserBasicLoader.field("lastLoginTime"),
});

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { Directory, User, Group, OrgUnit } from "../entities.js";
import { GoogleWorkspaceContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const DirectoryBasicLoader = Loader.entity({
  name: "google-workspace:directory:basic",
  context: GoogleWorkspaceContext,
  entity: Directory,

  async load(ref, ctx) {
    return EntityInput.create(ref, {
      domain: ctx.api.domain,
      customerId: ctx.api.customerId,
    });
  },
});

export const DirectoryUsersLoader = Loader.collection({
  name: "google-workspace:directory:users",
  context: GoogleWorkspaceContext,
  entity: Directory,
  target: User,

  async load(_ref, page, ctx) {
    const data = await ctx.api.listUsers(page.cursor);
    const items = (data.users as Record<string, unknown>[]).map((u) =>
      EntityInput.create(User.ref(u.id as string), {
        email: (u.primaryEmail as string) ?? "",
        name: ((u.name as Record<string, unknown>)?.fullName as string) ?? "",
        givenName: ((u.name as Record<string, unknown>)?.givenName as string) ?? "",
        familyName: ((u.name as Record<string, unknown>)?.familyName as string) ?? "",
        isAdmin: (u.isAdmin as boolean) ?? false,
        suspended: (u.suspended as boolean) ?? false,
        orgUnitPath: (u.orgUnitPath as string) ?? "",
        creationTime: u.creationTime ? new Date(u.creationTime as string) : undefined,
        lastLoginTime: u.lastLoginTime ? new Date(u.lastLoginTime as string) : undefined,
      }),
    );
    return Page.from(items, !!data.nextPageToken, data.nextPageToken);
  },
});

export const DirectoryGroupsLoader = Loader.collection({
  name: "google-workspace:directory:groups",
  context: GoogleWorkspaceContext,
  entity: Directory,
  target: Group,

  async load(_ref, page, ctx) {
    const data = await ctx.api.listGroups(page.cursor);
    const items = (data.groups as Record<string, unknown>[]).map((g) =>
      EntityInput.create(Group.ref(g.id as string), {
        email: (g.email as string) ?? "",
        name: (g.name as string) ?? "",
        description: (g.description as string) ?? "",
        directMembersCount: parseInt(String(g.directMembersCount ?? "0"), 10) || 0,
      }),
    );
    return Page.from(items, !!data.nextPageToken, data.nextPageToken);
  },
});

export const DirectoryOrgUnitsLoader = Loader.collection({
  name: "google-workspace:directory:org-units",
  context: GoogleWorkspaceContext,
  entity: Directory,
  target: OrgUnit,

  async load(_ref, _page, ctx) {
    const data = await ctx.api.listOrgUnits();
    const items = (data.organizationUnits as Record<string, unknown>[]).map((ou) =>
      EntityInput.create(OrgUnit.ref(ou.orgUnitId as string), {
        name: (ou.name as string) ?? "",
        description: (ou.description as string) ?? "",
        orgUnitPath: (ou.orgUnitPath as string) ?? "",
        parentOrgUnitPath: (ou.parentOrgUnitPath as string) ?? "",
      }),
    );
    return Page.from(items, false);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const DirectoryResolver = Resolver.for(Directory, {
  domain: DirectoryBasicLoader.field("domain"),
  customerId: DirectoryBasicLoader.field("customerId"),
  users: DirectoryUsersLoader.field(),
  groups: DirectoryGroupsLoader.field(),
  orgUnits: DirectoryOrgUnitsLoader.field(),
});

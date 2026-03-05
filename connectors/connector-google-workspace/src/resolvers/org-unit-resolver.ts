import { Loader, Resolver, EntityInput } from "@max/core";
import { OrgUnit } from "../entities.js";
import { GoogleWorkspaceContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

// OrgUnits have no individual GET endpoint suited for autoloading.
// They are populated by the DirectoryOrgUnitsLoader collection loader.
// This entity loader serves as a fallback that returns empty data.
export const OrgUnitBasicLoader = Loader.entity({
  name: "google-workspace:org-unit:basic",
  context: GoogleWorkspaceContext,
  entity: OrgUnit,

  async load(ref) {
    return EntityInput.create(ref, {
      name: "",
      description: "",
      orgUnitPath: "",
      parentOrgUnitPath: "",
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const OrgUnitResolver = Resolver.for(OrgUnit, {
  name: OrgUnitBasicLoader.field("name"),
  description: OrgUnitBasicLoader.field("description"),
  orgUnitPath: OrgUnitBasicLoader.field("orgUnitPath"),
  parentOrgUnitPath: OrgUnitBasicLoader.field("parentOrgUnitPath"),
});

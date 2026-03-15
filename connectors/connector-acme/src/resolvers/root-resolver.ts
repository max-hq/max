/**
 * AcmeRoot Resolver - Discovers workspaces from the root entry point.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeRoot, AcmeWorkspace } from "../entities.js";
import { AcmeAppContext } from "../context.js";
import { ListWorkspaces } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const RootWorkspacesLoader = Loader.collection({
  name: "acme:root:workspaces",
  context: AcmeAppContext,
  entity: AcmeRoot,
  target: AcmeWorkspace,

  async load(ref, page, env) {
    const workspaces = await env.ops.execute(ListWorkspaces, {});
    const items = workspaces.map((ws) =>
      EntityInput.create(AcmeWorkspace.ref(ws.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeRootResolver = Resolver.for(AcmeRoot, {
  workspaces: RootWorkspacesLoader.field(),
});

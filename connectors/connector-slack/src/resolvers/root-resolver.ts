/**
 * SlackRoot Resolver — entry point, loads the single workspace.
 */

import { Loader, Resolver, EntityInput, Page } from "@max/core";
import { SlackRoot, SlackWorkspace } from "../entities.js";
import { SlackAppContext } from "../context.js";
import { GetTeam } from "../operations.js";

export const RootWorkspaceLoader = Loader.ref({
  name: "slack:root:workspace",
  context: SlackAppContext,
  entity: SlackRoot,
  target: SlackWorkspace,

  async load(_ref, env) {
    const team = await env.ops.execute(GetTeam, {});
    return EntityInput.create(SlackWorkspace.ref(team.id), {
      name: team.name,
      domain: team.domain,
      iconUrl: team.icon?.image_132 ?? "",
    });
  },
});

export const SlackRootResolver = Resolver.for(SlackRoot, {
  workspace: RootWorkspaceLoader.field(),
});

import { Loader, Resolver, EntityInput } from "@max/core";
import { FathomActionItem } from "../entities.js";
import { FathomAppContext } from "../context.js";

// Action items are populated during collection load from the recording resolver.
// This entity loader exists as a fallback for direct ref resolution.

export const ActionItemBasicLoader = Loader.entity({
  name: "fathom:action-item:basic",
  context: FathomAppContext,
  entity: FathomActionItem,
  strategy: "autoload",

  async load(ref, env) {
    return EntityInput.create(ref, {});
  },
});

export const FathomActionItemResolver = Resolver.for(FathomActionItem, {
  description: ActionItemBasicLoader.field("description"),
  assignee: ActionItemBasicLoader.field("assignee"),
  timestampUrl: ActionItemBasicLoader.field("timestampUrl"),
});

import { Loader, Resolver, EntityInput } from "@max/core";
import { FathomParticipant } from "../entities.js";
import { FathomAppContext } from "../context.js";

// Participants are populated during collection load from the recording resolver.
// This entity loader exists as a fallback for direct ref resolution.

export const ParticipantBasicLoader = Loader.entity({
  name: "fathom:participant:basic",
  context: FathomAppContext,
  entity: FathomParticipant,
  strategy: "autoload",

  async load(ref, env) {
    return EntityInput.create(ref, {});
  },
});

export const FathomParticipantResolver = Resolver.for(FathomParticipant, {
  name: ParticipantBasicLoader.field("name"),
  email: ParticipantBasicLoader.field("email"),
});

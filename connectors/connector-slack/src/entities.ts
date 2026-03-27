/**
 * Slack entity definitions.
 *
 * Entity hierarchy:
 *   SlackRoot
 *     └─ SlackWorkspace
 *          ├─ SlackUser[]
 *          └─ SlackChannel[]
 *               └─ SlackMessage[]
 *                    └─ SlackMessage[] (thread replies, same type)
 *
 * Ordered leaf-first to avoid forward references.
 */

import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// SlackUser (leaf)
// ============================================================================

export interface SlackUser extends EntityDef<{
  name: ScalarField<"string">;
  displayName: ScalarField<"string">;
  email: ScalarField<"string">;
  isBot: ScalarField<"boolean">;
  isAdmin: ScalarField<"boolean">;
  timezone: ScalarField<"string">;
  avatarUrl: ScalarField<"string">;
}> {}

export const SlackUser: SlackUser = EntityDef.create("SlackUser", {
  name: Field.string(),
  displayName: Field.string(),
  email: Field.string(),
  isBot: Field.boolean(),
  isAdmin: Field.boolean(),
  timezone: Field.string(),
  avatarUrl: Field.string(),
});

// ============================================================================
// SlackMessage (leaf — thread replies reference the same type, resolved lazily)
// ============================================================================

export interface SlackMessage extends EntityDef<{
  text: ScalarField<"string">;
  authorId: ScalarField<"string">;
  timestamp: ScalarField<"string">;
  threadTimestamp: ScalarField<"string">;
  replyCount: ScalarField<"number">;
  isThreadParent: ScalarField<"boolean">;
  reactions: ScalarField<"string">;  // JSON-encoded [{name, count}]
}> {}

export const SlackMessage: SlackMessage = EntityDef.create("SlackMessage", {
  text: Field.string(),
  authorId: Field.string(),
  timestamp: Field.string(),
  threadTimestamp: Field.string(),
  replyCount: Field.number(),
  isThreadParent: Field.boolean(),
  reactions: Field.string(),
});

// ============================================================================
// SlackChannel (refs SlackMessage)
// ============================================================================

export interface SlackChannel extends EntityDef<{
  name: ScalarField<"string">;
  topic: ScalarField<"string">;
  purpose: ScalarField<"string">;
  isPrivate: ScalarField<"boolean">;
  isArchived: ScalarField<"boolean">;
  memberCount: ScalarField<"number">;
  messages: CollectionField<SlackMessage>;
}> {}

export const SlackChannel: SlackChannel = EntityDef.create("SlackChannel", {
  name: Field.string(),
  topic: Field.string(),
  purpose: Field.string(),
  isPrivate: Field.boolean(),
  isArchived: Field.boolean(),
  memberCount: Field.number(),
  messages: Field.collection(SlackMessage),
});

// ============================================================================
// SlackWorkspace (collections of SlackUser, SlackChannel)
// ============================================================================

export interface SlackWorkspace extends EntityDef<{
  name: ScalarField<"string">;
  domain: ScalarField<"string">;
  iconUrl: ScalarField<"string">;
  users: CollectionField<SlackUser>;
  channels: CollectionField<SlackChannel>;
}> {}

export const SlackWorkspace: SlackWorkspace = EntityDef.create("SlackWorkspace", {
  name: Field.string(),
  domain: Field.string(),
  iconUrl: Field.string(),
  users: Field.collection(SlackUser),
  channels: Field.collection(SlackChannel),
});

// ============================================================================
// SlackRoot (singleton)
// ============================================================================

export interface SlackRoot extends EntityDef<{
  workspace: RefField<SlackWorkspace>;
}> {}

export const SlackRoot: SlackRoot = EntityDef.create("SlackRoot", {
  workspace: Field.ref(SlackWorkspace),
});

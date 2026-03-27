/**
 * Gmail entity definitions.
 *
 * Entity hierarchy:
 *   GmailRoot
 *     └─ GmailMailbox (one per authenticated user)
 *          ├─ GmailLabel[]
 *          └─ GmailThread[]
 *               └─ GmailMessage[]
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
// GmailLabel (leaf)
// ============================================================================

export interface GmailLabel extends EntityDef<{
  name: ScalarField<"string">;
  type: ScalarField<"string">;      // "system" | "user"
  messageCount: ScalarField<"number">;
  unreadCount: ScalarField<"number">;
}> {}

export const GmailLabel: GmailLabel = EntityDef.create("GmailLabel", {
  name: Field.string(),
  type: Field.string(),
  messageCount: Field.number(),
  unreadCount: Field.number(),
});

// ============================================================================
// GmailMessage (leaf — belongs to a thread)
// ============================================================================

export interface GmailMessage extends EntityDef<{
  threadId: ScalarField<"string">;
  subject: ScalarField<"string">;
  from: ScalarField<"string">;
  to: ScalarField<"string">;
  cc: ScalarField<"string">;
  date: ScalarField<"date">;
  snippet: ScalarField<"string">;
  bodyText: ScalarField<"string">;
  labelIds: ScalarField<"string">;   // JSON-encoded string[]
  isUnread: ScalarField<"boolean">;
  isStarred: ScalarField<"boolean">;
}> {}

export const GmailMessage: GmailMessage = EntityDef.create("GmailMessage", {
  threadId: Field.string(),
  subject: Field.string(),
  from: Field.string(),
  to: Field.string(),
  cc: Field.string(),
  date: Field.date(),
  snippet: Field.string(),
  bodyText: Field.string(),
  labelIds: Field.string(),
  isUnread: Field.boolean(),
  isStarred: Field.boolean(),
});

// ============================================================================
// GmailThread (collection of GmailMessage)
// ============================================================================

export interface GmailThread extends EntityDef<{
  subject: ScalarField<"string">;
  snippet: ScalarField<"string">;
  lastMessageDate: ScalarField<"date">;
  messageCount: ScalarField<"number">;
  participants: ScalarField<"string">;   // JSON-encoded string[] of email addresses
  labelIds: ScalarField<"string">;       // JSON-encoded string[]
  isUnread: ScalarField<"boolean">;
  messages: CollectionField<GmailMessage>;
}> {}

export const GmailThread: GmailThread = EntityDef.create("GmailThread", {
  subject: Field.string(),
  snippet: Field.string(),
  lastMessageDate: Field.date(),
  messageCount: Field.number(),
  participants: Field.string(),
  labelIds: Field.string(),
  isUnread: Field.boolean(),
  messages: Field.collection(GmailMessage),
});

// ============================================================================
// GmailMailbox (the authenticated user's mailbox)
// ============================================================================

export interface GmailMailbox extends EntityDef<{
  emailAddress: ScalarField<"string">;
  displayName: ScalarField<"string">;
  labels: CollectionField<GmailLabel>;
  threads: CollectionField<GmailThread>;
}> {}

export const GmailMailbox: GmailMailbox = EntityDef.create("GmailMailbox", {
  emailAddress: Field.string(),
  displayName: Field.string(),
  labels: Field.collection(GmailLabel),
  threads: Field.collection(GmailThread),
});

// ============================================================================
// GmailRoot (singleton)
// ============================================================================

export interface GmailRoot extends EntityDef<{
  mailbox: RefField<GmailMailbox>;
}> {}

export const GmailRoot: GmailRoot = EntityDef.create("GmailRoot", {
  mailbox: Field.ref(GmailMailbox),
});

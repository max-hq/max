/**
 * Claude Code Conversations entity definitions.
 *
 * Ordered leaf-first to avoid forward references in const declarations.
 * Interfaces are hoisted and can reference each other freely.
 */

import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// Message (leaf — back-ref to Session via thunk)
// ============================================================================

export interface Message extends EntityDef<{
  type: ScalarField<"string">;
  content: ScalarField<"string">;
  timestamp: ScalarField<"string">;
  model: ScalarField<"string">;
  session: RefField<Session>;
}> {}

export const Message: Message = EntityDef.create("Message", {
  type: Field.string(),
  content: Field.string(),
  timestamp: Field.string(),
  model: Field.string(),
  session: Field.refThunk(() => Session),
});

// ============================================================================
// Session (collection of Messages, back-ref to Project via thunk)
// ============================================================================

export interface Session extends EntityDef<{
  title: ScalarField<"string">;
  summary: ScalarField<"string">;
  firstMessage: ScalarField<"string">;
  model: ScalarField<"string">;
  gitBranch: ScalarField<"string">;
  cwd: ScalarField<"string">;
  version: ScalarField<"string">;
  startedAt: ScalarField<"string">;
  endedAt: ScalarField<"string">;
  messageCount: ScalarField<"number">;
  project: RefField<Project>;
  messages: CollectionField<Message>;
}> {}

export const Session: Session = EntityDef.create("Session", {
  title: Field.string(),
  summary: Field.string(),
  firstMessage: Field.string(),
  model: Field.string(),
  gitBranch: Field.string(),
  cwd: Field.string(),
  version: Field.string(),
  startedAt: Field.string(),
  endedAt: Field.string(),
  messageCount: Field.number(),
  project: Field.refThunk(() => Project),
  messages: Field.collection(Message),
});

// ============================================================================
// Project (collection of Sessions)
// ============================================================================

export interface Project extends EntityDef<{
  name: ScalarField<"string">;
  path: ScalarField<"string">;
  sessions: CollectionField<Session>;
}> {}

export const Project: Project = EntityDef.create("Project", {
  name: Field.string(),
  path: Field.string(),
  sessions: Field.collection(Session),
});

// ============================================================================
// Root (singleton entry point — collection of Projects)
// ============================================================================

export interface Root extends EntityDef<{
  projects: CollectionField<Project>;
}> {}

export const Root: Root = EntityDef.create("Root", {
  projects: Field.collection(Project),
});

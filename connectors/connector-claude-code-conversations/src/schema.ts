/**
 * Claude Code Conversations connector schema.
 */

import { Schema } from "@max/core";
import { Message, Session, Project, Root } from "./entities.js";

export { Message, Session, Project, Root };

export const ConversationsSchema = Schema.create({
  namespace: "conversations",
  entities: [Message, Session, Project, Root],
  roots: [Root],
});

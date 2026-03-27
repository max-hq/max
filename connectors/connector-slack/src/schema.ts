import { Schema } from "@max/core";
import {
  SlackRoot,
  SlackWorkspace,
  SlackUser,
  SlackChannel,
  SlackMessage,
} from "./entities.js";

export const SlackSchema = Schema.create({
  namespace: "slack",
  entities: [SlackRoot, SlackWorkspace, SlackUser, SlackChannel, SlackMessage],
  roots: [SlackRoot],
});

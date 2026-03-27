import { Schema } from "@max/core";
import {
  SlackWorkspace,
  SlackUser,
  SlackChannel,
  SlackMessage,
} from "./entities.js";

export const SlackSchema = Schema.create({
  namespace: "slack",
  entities: [SlackWorkspace, SlackUser, SlackChannel, SlackMessage],
  roots: [SlackWorkspace],
});

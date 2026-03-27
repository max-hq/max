import { Schema } from "@max/core";
import {
  GmailRoot,
  GmailMailbox,
  GmailLabel,
  GmailThread,
  GmailMessage,
} from "./entities.js";

export const GmailSchema = Schema.create({
  namespace: "gmail",
  entities: [GmailRoot, GmailMailbox, GmailLabel, GmailThread, GmailMessage],
  roots: [GmailRoot],
});

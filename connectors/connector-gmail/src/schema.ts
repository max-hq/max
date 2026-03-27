import { Schema } from "@max/core";
import {
  GmailMailbox,
  GmailLabel,
  GmailThread,
  GmailMessage,
} from "./entities.js";

export const GmailSchema = Schema.create({
  namespace: "gmail",
  entities: [GmailMailbox, GmailLabel, GmailThread, GmailMessage],
  roots: [GmailMailbox],
});

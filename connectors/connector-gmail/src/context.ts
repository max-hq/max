/**
 * Gmail connector runtime context.
 */
import { Context } from "@max/core";
import type { GmailClientProvider } from "./gmail-client.js";

export class GmailAppContext extends Context {
  api = Context.instance<GmailClientProvider>();
  emailAddress = Context.string;
  maxThreads = Context.number;
  labelFilter = Context.instance<string[]>();
  includeSpamTrash = Context.boolean;
}

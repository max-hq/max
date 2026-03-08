/**
 * AcmeContext - Context definition for Acme connector.
 */

import { Context } from "@max/core";
import type { AcmeClientProvider } from "./acme-client.js";

export class AcmeAppContext extends Context {
  api = Context.instance<AcmeClientProvider>();
  workspaceId = Context.string;
}

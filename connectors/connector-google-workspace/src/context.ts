import { Context } from "@max/core";
import type { GoogleWorkspaceClient } from "./google-workspace-client.js";

export class GoogleWorkspaceContext extends Context {
  api = Context.instance<GoogleWorkspaceClient>();
}

/**
 * GitHubContext - Context definition for GitHub connector.
 */

import { Context } from "@max/core";
import type { GitHubClient } from "./github-client.js";

export class GitHubContext extends Context {
  api = Context.instance<GitHubClient>();
}

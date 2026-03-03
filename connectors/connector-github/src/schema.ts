/**
 * GitHub connector schema.
 */

import { Schema } from "@max/core";
import { GitHubUser, GitHubIssue, GitHubRepository } from "./entities.js";

export { GitHubUser, GitHubIssue, GitHubRepository };

export const GitHubSchema = Schema.create({
  namespace: "github",
  entities: [GitHubUser, GitHubIssue, GitHubRepository],
  roots: [GitHubRepository],
});

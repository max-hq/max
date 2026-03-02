/**
 * Linear connector schema.
 */

import { Schema } from "@max/core";
import {
  LinearUser,
  LinearIssue,
  LinearProject,
  LinearTeam,
  LinearOrganization,
} from "./entities.js";

export { LinearUser, LinearIssue, LinearProject, LinearTeam, LinearOrganization };

export const LinearSchema = Schema.create({
  namespace: "linear",
  entities: [LinearUser, LinearIssue, LinearProject, LinearTeam, LinearOrganization],
  roots: [LinearOrganization],
});

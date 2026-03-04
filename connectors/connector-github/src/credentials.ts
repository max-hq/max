/**
 * GitHub credential definitions.
 *
 * Token is extracted from the `gh` CLI during onboarding.
 */

import { Credential } from "@max/connector";

export const GitHubToken = Credential.string("github_token");

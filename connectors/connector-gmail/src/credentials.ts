/**
 * Gmail credential definitions.
 *
 * Uses OAuth 2.0 with refresh token flow (Google Identity Platform).
 * Required scopes:
 *   https://www.googleapis.com/auth/gmail.readonly
 *
 * The access token is short-lived (1 hour). The connector platform handles
 * refresh via the credential store's scheduler.
 */
import { Credential } from "@max/connector";

export const GmailAccessToken = Credential.string("access_token");
export const GmailRefreshToken = Credential.string("refresh_token");

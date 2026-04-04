/**
 * Slack credential definitions.
 *
 * Uses a Bot Token (xoxb-…) obtained via OAuth app installation.
 * Required scopes:
 *   channels:read, channels:history, groups:read, groups:history,
 *   users:read, users:read.email, team:read
 */
import { Credential } from "@max/connector";

export const SlackBotToken = Credential.string("bot_token");

/**
 * Slack onboarding flow — bot token → validation → workspace confirmation.
 *
 * Users need a Slack app with a Bot Token (xoxb-…).
 * Required scopes: channels:read, channels:history, groups:read,
 *                  groups:history, users:read, users:read.email, team:read
 */

import { OnboardingFlow } from "@max/connector";
import { SlackClient } from "./slack-client.js";
import { SlackBotToken } from "./credentials.js";
import type { SlackConfig } from "./config.js";

const getCreds = OnboardingFlow.InputStep.create({
  label: "Slack Bot Token",
  description:
    "Create a Slack app at https://api.slack.com/apps, add a Bot Token " +
    "with scopes: channels:read, channels:history, groups:read, groups:history, " +
    "users:read, users:read.email, team:read — then install it to your workspace " +
    "and paste the Bot Token (xoxb-…) below.",
  credentials: { bot_token: SlackBotToken },
});

const verify = OnboardingFlow.ValidationStep.after(getCreds, {
  label: "Verify token",
  async validate(_acc, { credentialStore }) {
    const token = await credentialStore.get("bot_token");
    const client = new SlackClient(token);
    // Validates auth and scopes — throws if token is invalid
    await client.getTeam();
  },
});

const configure = OnboardingFlow.InputStep.after(verify, {
  label: "Sync settings",
  description: "Choose which channels to sync and how much history to pull.",
  fields: {
    channelTypes: {
      label: "Channel types",
      type: "string",
      required: false,
      default: "all",
      description: 'One of: "public_channel", "private_channel", or "all"',
    },
    maxMessagesPerChannel: {
      label: "Max messages per channel",
      type: "number",
      required: false,
      default: 1000,
      description: "Maximum number of historical messages to sync per channel (default: 1000)",
    },
  },
});

export const SlackOnboarding = OnboardingFlow.create<SlackConfig>([
  getCreds,
  verify,
  configure,
]);

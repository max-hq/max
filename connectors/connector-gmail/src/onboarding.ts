/**
 * Gmail onboarding flow — OAuth token → validation → sync settings.
 *
 * Gmail requires OAuth 2.0 (no API key option). The user must:
 * 1. Create a Google Cloud project and enable the Gmail API
 * 2. Create OAuth 2.0 credentials (Desktop app type)
 * 3. Run the OAuth flow to obtain an access token + refresh token
 *
 * For a streamlined experience, the onboarding guides the user through
 * pasting tokens obtained via `gcloud auth` or a helper script.
 */

import { OnboardingFlow } from "@max/connector";
import { GmailClient } from "./gmail-client.js";
import { GmailAccessToken, GmailRefreshToken } from "./credentials.js";
import type { GmailConfig } from "./config.js";

const getCreds = OnboardingFlow.InputStep.create({
  label: "Gmail OAuth credentials",
  description:
    "Authenticate with Gmail via OAuth. You'll need to enable the Gmail API " +
    "at https://console.cloud.google.com and create OAuth 2.0 credentials. " +
    "Then run the OAuth flow to obtain an access token and refresh token.",
  credentials: {
    access_token: GmailAccessToken,
    refresh_token: GmailRefreshToken,
  },
});

const verify = OnboardingFlow.ValidationStep.after(getCreds, {
  label: "Verify Gmail access",
  async validate(_acc, { credentialStore }) {
    const token = await credentialStore.get("access_token");
    const client = new GmailClient(() => token);
    const profile = await client.getProfile();
    // Store email address for display and config
    return { emailAddress: profile.emailAddress };
  },
});

const configure = OnboardingFlow.InputStep.after(verify, {
  label: "Sync settings",
  description: "Choose how much Gmail history to sync.",
  fields: {
    maxThreads: {
      label: "Max threads to sync",
      type: "number",
      required: false,
      default: 2000,
      description: "Total number of email threads to sync (default: 2000)",
    },
    includeSpamTrash: {
      label: "Include spam and trash",
      type: "boolean",
      required: false,
      default: false,
    },
  },
});

export const GmailOnboarding = OnboardingFlow.create<GmailConfig>([
  getCreds,
  verify,
  configure,
]);

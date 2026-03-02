/**
 * Linear onboarding flow — API key → validation.
 *
 * Linear API keys are organization-scoped, so no workspace selection is needed.
 */

import { OnboardingFlow, InputStep, ValidationStep } from "@max/connector";
import { LinearClient as LinearSdkClient } from "@linear/sdk";
import { LinearApiKey } from "./credentials.js";
import type { LinearConfig } from "./config.js";

export const LinearOnboarding = OnboardingFlow.create<LinearConfig>([
  InputStep.create({
    label: "API key",
    description: "Enter your Linear personal API key (Settings → API → Personal API keys)",
    credentials: { api_key: LinearApiKey },
  }),

  ValidationStep.create({
    label: "Verify credentials",
    async validate(_accumulated, { credentialStore }) {
      const token = await credentialStore.get("api_key");
      const client = new LinearSdkClient({ apiKey: token });
      await client.viewer;
    },
  }),
]);

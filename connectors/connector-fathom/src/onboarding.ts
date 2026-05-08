import { OnboardingFlow } from "@max/connector";
import { FathomApiToken } from "./credentials.js";
import { FathomHttpClient } from "./fathom-client.js";
import type { FathomConfig } from "./config.js";

const getCreds = OnboardingFlow.InputStep.create({
  label: "Fathom API credentials",
  description: "Enter your Fathom API token. You can find it at https://fathom.video/settings/api.",
  credentials: { api_token: FathomApiToken },
});

const verify = OnboardingFlow.ValidationStep.after(getCreds, {
  label: "Verify credentials",
  async validate(acc, { credentialStore }) {
    const token = await credentialStore.get("api_token");
    const client = new FathomHttpClient("https://api.fathom.video", token);
    await client.listMeetings({ maxPages: 1 });
  },
});

export const FathomOnboarding = OnboardingFlow.create<FathomConfig>([
  getCreds, verify,
]);

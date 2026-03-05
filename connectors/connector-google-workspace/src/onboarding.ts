import { OnboardingFlow, InputStep, CustomStep, ValidationStep } from "@max/connector";
import { ServiceAccountKey } from "./credentials.js";
import { GoogleWorkspaceClient } from "./google-workspace-client.js";
import {
  ErrGoogleWorkspaceServiceAccountKeyInvalid,
} from "./errors.js";
import type { GoogleWorkspaceConfig } from "./config.js";

export const GoogleWorkspaceOnboarding = OnboardingFlow.create<GoogleWorkspaceConfig>([
  InputStep.create({
    label: "Connection details",
    description: "Enter your Google Workspace service account details",
    fields: {
      serviceAccountKeyPath: { label: "Path to service account key JSON file", type: "string" },
      adminEmail: { label: "Admin email for domain-wide delegation", type: "string" },
      domain: { label: "Google Workspace domain", type: "string" },
      customerId: { label: "Customer ID (default: my_customer)", type: "string", required: false },
    },
  }),

  CustomStep.create({
    label: "Read and validate service account key",
    async execute(accumulated, ctx) {
      const keyPath = accumulated.serviceAccountKeyPath as string;
      let keyJson: string;
      try {
        keyJson = await Bun.file(keyPath).text();
      } catch {
        throw ErrGoogleWorkspaceServiceAccountKeyInvalid.create({
          reason: `could not read file at ${keyPath}`,
        });
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(keyJson);
      } catch {
        throw ErrGoogleWorkspaceServiceAccountKeyInvalid.create({
          reason: "file is not valid JSON",
        });
      }

      if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
        throw ErrGoogleWorkspaceServiceAccountKeyInvalid.create({
          reason: "missing client_email or private_key fields",
        });
      }

      await ctx.credentialStore.set(ServiceAccountKey.name, keyJson);

      return {
        adminEmail: accumulated.adminEmail as string,
        domain: accumulated.domain as string,
        customerId: (accumulated.customerId as string) || "my_customer",
      };
    },
  }),

  ValidationStep.create({
    label: "Verify Google Workspace access",
    async validate(accumulated, { credentialStore }) {
      const keyJson = await credentialStore.get(ServiceAccountKey.name);
      const client = new GoogleWorkspaceClient(
        { get: async () => keyJson },
        accumulated.adminEmail as string,
        accumulated.domain as string,
        (accumulated.customerId as string) || "my_customer",
      );
      await client.start();
      await client.listUsers();
    },
  }),
]);

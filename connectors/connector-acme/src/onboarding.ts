/**
 * Acme onboarding flow — base URL → API key → validation → workspace selection.
 */

import { OnboardingFlow, InputStep, ValidationStep, SelectStep } from "@max/connector";
import { AcmeHttpClient } from "@max/acme";
import { AcmeApiToken } from "./credentials.js";
import type { AcmeConfig } from "./config.js";

const getTenant = OnboardingFlow.InputStep.create({
  label: 'Acme tenant',
  description: 'Enter the URL of your Acme instance (e.g. https://mycompany.acme.com)',
  fields: {
    baseUrl: { label: 'Tenant URL', type: 'string', required: true },
  },
})

const getCreds = OnboardingFlow.InputStep.after(getTenant, {
  label: 'API credentials',
  description: (acc) => {
    const baseUrl = acc.baseUrl.replace(/\/+$/, '')
    return `Create an API token at ${baseUrl}/settings/api-keys and paste it below.`
  },
  credentials: { api_token: AcmeApiToken },
})

const verify = OnboardingFlow.ValidationStep.after(getCreds, {
  label: 'Verify credentials',
  async validate(acc, { credentialStore }) {
    const token = await credentialStore.get('api_token')
    const client = new AcmeHttpClient({ baseUrl: acc.baseUrl, apiKey: token })
    await client.listWorkspaces()
  },
})

const selectWorkspace = OnboardingFlow.SelectStep.after(verify, {
  label: 'Choose workspace',
  field: 'workspaceId',
  async options(acc, { credentialStore }) {
    const token = await credentialStore.get('api_token')
    const client = new AcmeHttpClient({ baseUrl: acc.baseUrl, apiKey: token })
    const workspaces = await client.listWorkspaces()
    return workspaces.map((ws) => ({ label: ws.name, value: ws.id }))
  },
})

export const AcmeOnboarding = OnboardingFlow.create<AcmeConfig>([
  getTenant, getCreds, verify, selectWorkspace,
]);

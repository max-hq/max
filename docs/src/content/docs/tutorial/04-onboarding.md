---
title: Onboarding
sidebar:
  order: 4
---

Onboarding is the step-by-step flow users go through when installing your connector. It collects configuration and credentials, then validates connectivity.

## Credentials

Before building the flow, declare the credentials your connector needs. Credentials are typed references to secrets - stored separately from config, never mixed in.

### API tokens

```typescript
// connectors/connector-acme/src/credentials.ts
import { Credential } from "@max/connector";

export const AcmeApiToken = Credential.string("api_token");
```

### OAuth pairs

```typescript
export const GoogleAuth = Credential.oauth({
  refreshToken: "refresh_token",
  accessToken: "access_token",
  expiresIn: 3500,
  async refresh(refreshToken) {
    const result = await google.oauth2.refresh(refreshToken);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  },
});
```

## Build the onboarding flow

Each step is a named value. Use `.create()` for the first step and `.after(prevStep, ...)` for subsequent steps - this gives you typed access to values collected in earlier steps.

```typescript
// connectors/connector-acme/src/onboarding.ts
import { OnboardingFlow } from "@max/connector";
import { AcmeHttpClient } from "@max/acme";
import { AcmeApiToken } from "./credentials.js";
import type { AcmeConfig } from "./config.js";

const getTenant = OnboardingFlow.InputStep.create({
  label: 'Acme tenant',
  description: 'Enter the URL of your Acme instance (e.g. https://mycompany.acme.com)',
  fields: {
    baseUrl: { label: 'Tenant URL', type: 'string', required: true },
  },
});

const getCreds = OnboardingFlow.InputStep.after(getTenant, {
  label: 'API credentials',
  description: (acc) => {
    const baseUrl = acc.baseUrl.replace(/\/+$/, '');
    return `Create an API token at ${baseUrl}/settings/api-keys and paste it below.`;
  },
  credentials: { api_token: AcmeApiToken },
});

const verify = OnboardingFlow.ValidationStep.after(getCreds, {
  label: 'Verify credentials',
  async validate(acc, { credentialStore }) {
    const token = await credentialStore.get('api_token');
    const client = new AcmeHttpClient({ baseUrl: acc.baseUrl, apiKey: token });
    await client.listWorkspaces();
  },
});

const selectWorkspace = OnboardingFlow.SelectStep.after(verify, {
  label: 'Choose workspace',
  field: 'workspaceId',
  async options(acc, { credentialStore }) {
    const token = await credentialStore.get('api_token');
    const client = new AcmeHttpClient({ baseUrl: acc.baseUrl, apiKey: token });
    const workspaces = await client.listWorkspaces();
    return workspaces.map(ws => ({ label: ws.name, value: ws.id }));
  },
});

export const AcmeOnboarding = OnboardingFlow.create<AcmeConfig>([
  getTenant, getCreds, verify, selectWorkspace,
]);
```

The generic `<AcmeConfig>` determines what the flow produces - the accumulated config object passed to `initialise()`.

## Step types

| Step | Purpose |
|------|---------|
| `OnboardingFlow.InputStep` | Collect fields and credentials from the user |
| `OnboardingFlow.ValidationStep` | Test connectivity or credentials (async) |
| `OnboardingFlow.SelectStep` | Dynamic dropdown populated from an API call |
| `OnboardingFlow.CustomStep` | Arbitrary async work (receives `prompter` for user I/O) |

Each has `.create(opts)` and `.after(prevStep, opts)`. Use `.after()` whenever a step needs values from earlier steps.

## Typed accumulated state

When you use `.after(prevStep, ...)`, callbacks receive a typed `accumulated` parameter:

- **InputStep** fields are inferred from their descriptors (`type: 'string'` becomes `string`)
- **SelectStep** adds `{ [field]: string }` from the user's selection
- **ValidationStep** passes the accumulated type through unchanged
- **CustomStep** extends it with whatever `execute` returns

This means `acc.baseUrl` in the example above is `string` - no casts needed.

## Dynamic descriptions

`InputStep.description` can be a string or a function of accumulated state. Use a function when instructions reference values from earlier steps:

```typescript
description: (acc) => `Create a token at ${acc.baseUrl}/settings/api-keys`
```

## CustomStep and prompter

`CustomStep` receives an `OnboardingPrompter` for displaying messages and asking questions during arbitrary async work:

```typescript
OnboardingFlow.CustomStep.after(prevStep, {
  label: 'Authenticate',
  async execute(acc, ctx, prompter) {
    prompter.write('Opening browser...\n');
    // ... start OAuth flow ...
    return {};
  },
});
```

## Config type

The config type is plain data - whatever your onboarding flow produces:

```typescript
// connectors/connector-acme/src/config.ts
export interface AcmeConfig {
  readonly baseUrl: string;
  readonly workspaceId: string;
}
```

**Key principle:** Credentials flow into `credentialStore` during onboarding and are never mixed into the config object. Config holds non-secret values (URLs, workspace IDs). Secrets are accessed through `CredentialProvider` handles at runtime.

## What you have so far

Your connector now has:

- A data model (entities, schema, context)
- A sync pipeline (loaders, resolvers, seeder)
- Operations wrapping API calls
- An onboarding flow collecting config and credentials

The final step is wiring everything together into an installable connector package.

**Next: [Wiring and Packaging](/tutorial/05-wiring-and-packaging/)**

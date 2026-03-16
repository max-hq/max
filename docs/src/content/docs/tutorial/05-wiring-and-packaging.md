---
title: Wiring and Packaging
sidebar:
  order: 5
---

With all the pieces built, it's time to wire them into an installable connector and set up the package structure.

## ConnectorDef

Ties schema, resolvers, operations, seeder, and onboarding into a single descriptor:

```typescript
// connectors/connector-acme/src/index.ts
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { Context } from "@max/core";
import { AcmeOperations } from "./operations.js";

const AcmeDef = ConnectorDef.create<AcmeConfig>({
  name: "acme",
  displayName: "Acme",
  description: "Project management connector powered by Acme",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: AcmeSchema,
  onboarding: AcmeOnboarding,
  seeder: AcmeSeeder,
  resolvers: [
    AcmeRootResolver,
    AcmeUserResolver,
    AcmeWorkspaceResolver,
    AcmeProjectResolver,
  ],
  operations: [...AcmeOperations],
});
```

## ConnectorModule

Pairs the def with an `initialise` function that creates a live `Installation`:

```typescript
const AcmeConnector = ConnectorModule.create<AcmeConfig>({
  def: AcmeDef,
  initialise(config, credentials) {
    const tokenHandle = credentials.get(AcmeApiToken);
    const api = new AcmeConnection(config, tokenHandle);

    const ctx = Context.build(AcmeAppContext, {
      api,
      workspaceId: config.workspaceId,
    });

    return Installation.create({
      context: ctx,
      async start() {
        await api.start();
        credentials.startRefreshSchedulers();
      },
      async stop() {
        credentials.stopRefreshSchedulers();
      },
      async health() {
        const result = await api.health();
        return result.ok
          ? { status: "healthy" }
          : { status: "unhealthy", reason: result.error ?? "Unknown error" };
      },
    });
  },
});

export default AcmeConnector;
```

**The default export is the ConnectorModule.** This is what the registry imports.

### What happens during initialise

1. `credentials.get(AcmeApiToken)` returns a `CredentialHandle` - a lazy handle, not the raw secret
2. You build your API client wrapper, passing the handle (credentials aren't resolved yet)
3. `Context.build()` hydrates the context class with real values
4. `Installation.create()` packages context + lifecycle hooks
5. Later, the platform calls `start()` - that's when credentials resolve and the HTTP client is constructed

### Installation lifecycle

| Hook | When | Purpose |
|------|------|---------|
| `start()` | Before first sync | Resolve credentials, create HTTP clients |
| `stop()` | On shutdown | Clean up schedulers, close connections |
| `health()` | On demand | Lightweight connectivity check |

## Package setup

### Where connectors live

Connectors live in a **connector collection** - a directory (or repo) containing one or more `connector-*` folders. A collection can live anywhere; it doesn't need to be inside the Max monorepo.

Install a collection into Max with:

```bash
# Local path
max -g install --collection /path/to/my-connectors

# Git URL
max -g install --collection git@github.com:my-org/max-connectors.git
```

The registry scans installed collections for `connector-*` folders, reads each `package.json`, and registers a lazy loader. Your connector is only imported when first needed.

### Collection layout

A collection is a Bun workspace with one or more connectors:

```
my-connectors/
├── package.json
├── connector-github/
│   ├── package.json
│   └── src/
│       └── index.ts
├── connector-linear/
│   ├── package.json
│   └── src/
│       └── index.ts
```

### Collection root package.json

```json
{
  "name": "my-connectors",
  "private": true,
  "workspaces": {
    "packages": ["connector-*"],
    "catalog": {
      "@max/core": "link:@max/core",
      "@max/connector": "link:@max/connector",
      "@types/bun": "latest",
      "typescript": "5.9.3"
    }
  }
}
```

The `link:` entries resolve to your local Max checkout via `bun link`. Running `bun install` in the Max monorepo links `@max/core` and `@max/connector` as global packages. Running `bun install` in your collection picks them up.

### Connector package.json

```json
{
  "name": "@max/connector-acme",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "types": "./src/index.ts",
    "default": "./src/index.ts"
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target node",
    "typecheck": "tsc --noEmit",
    "test": "bun test --pass-with-no-tests"
  },
  "dependencies": {
    "@max/core": "catalog:",
    "@max/connector": "catalog:"
  },
  "devDependencies": {
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

Use `"catalog:"` for `@max/core` and `@max/connector` - this resolves through the collection root's catalog. Point both `types` and `default` exports to source.

## File structure

Here's the complete connector layout:

```
connectors/connector-acme/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # ConnectorDef + ConnectorModule (default export)
│   ├── config.ts            # TConfig interface
│   ├── entities.ts          # Entity definitions
│   ├── schema.ts            # Schema
│   ├── credentials.ts       # Credential declarations
│   ├── context.ts           # Context definition
│   ├── onboarding.ts        # OnboardingFlow
│   ├── seeder.ts            # Seeder + SyncPlan
│   ├── acme-client.ts       # API client wrapper
│   └── resolvers/
│       ├── root-resolver.ts
│       ├── user-resolver.ts
│       ├── workspace-resolver.ts
│       └── project-resolver.ts
```

## Your connector is complete

You now have a working, installable connector with:

- A typed data model (entities, schema, context)
- A sync pipeline (loaders, resolvers, seeder)
- Operations wrapping every API call
- An onboarding flow for user setup
- Assembly (ConnectorDef, ConnectorModule, Installation)
- A publishable package structure

For most connectors, this is everything you need. The next part covers an advanced optimization for connectors that need to extract multiple entity types from a single API endpoint.

**Next: [Advanced Patterns](/tutorial/06-advanced-patterns/)**

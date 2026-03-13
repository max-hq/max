# Creating a Connector

Step-by-step guide to building a Max connector. Each section adds one concept; by the end you have a working, installable connector.

All examples use the Acme connector (`connectors/connector-acme/`) as reference.

---

## 1. Define Your Entities

Entities are the data objects your connector syncs - users, projects, tasks, etc.

```typescript
// connectors/connector-acme/src/entities.ts
import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";
```

### Scalar fields

```typescript
export interface AcmeUser extends EntityDef<{
  displayName: ScalarField<"string">;
  email: ScalarField<"string">;
  role: ScalarField<"string">;
  active: ScalarField<"boolean">;
}> {}

export const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  displayName: Field.string(),
  email: Field.string(),
  role: Field.string(),
  active: Field.boolean(),
});
```

**Pattern:** Interface + const with the same name. Both type and value in one import (`import { AcmeUser } from ...`). This dual declaration is admittedly a bit cumbersome - code generation for entity definitions is planned.

### Relational fields

Use `Field.ref()` for a reference to another entity, and `Field.collection()` for a one-to-many relationship:

```typescript
export interface AcmeProject extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  status: ScalarField<"string">;
  owner: RefField<AcmeUser>;
  tasks: CollectionField<AcmeTask>;
}> {}

export const AcmeProject: AcmeProject = EntityDef.create("AcmeProject", {
  name: Field.string(),
  description: Field.string(),
  status: Field.string(),
  owner: Field.ref(AcmeUser),
  tasks: Field.collection(AcmeTask),
});
```

### Field types

| Factory | Type | Use |
|---------|------|-----|
| `Field.string()` | `ScalarField<"string">` | Text values |
| `Field.number()` | `ScalarField<"number">` | Numeric values |
| `Field.boolean()` | `ScalarField<"boolean">` | True/false |
| `Field.date()` | `ScalarField<"date">` | Timestamps |
| `Field.ref(Target)` | `RefField<Target>` | Reference to another entity |
| `Field.refThunk(() => Target)` | `RefField<Target>` | Lazy ref (breaks circular references) |
| `Field.collection(Target)` | `CollectionField<Target>` | One-to-many relationship |

### Ordering

Declare entities leaf-first so that `Field.ref()` targets are already defined when you reference them. Interfaces are hoisted and can reference each other freely, but the const values need their dependencies to exist:

```
AcmeUser       (leaf - no refs)
AcmeTask       (refs AcmeUser)
AcmeProject    (refs AcmeUser, collection of AcmeTask)
AcmeWorkspace  (collections of AcmeUser, AcmeProject)
AcmeRoot       (collection of AcmeWorkspace)
```

If you have circular references (A refs B, B refs A), use `Field.refThunk()` to break the cycle:

```typescript
export const AcmeTask: AcmeTask = EntityDef.create("AcmeTask", {
  title: Field.string(),
  // AcmeProject isn't defined yet - use a thunk to defer resolution
  project: Field.refThunk(() => AcmeProject),
});
```

---

## 2. Define Your Schema

Schema declares your connector's data model: all entities and which ones are entry points for sync.

```typescript
// connectors/connector-acme/src/schema.ts
import { Schema } from "@max/core";
import { AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask } from "./entities.js";

export const AcmeSchema = Schema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask],
  roots: [AcmeRoot],
});
```

**`roots`** are the starting points for sync - the seeder creates root entities, and the sync plan fans out from there.

---

## 3. Define Your Context

Context holds runtime dependencies that loaders need - API clients, configuration values, etc.

```typescript
// connectors/connector-acme/src/context.ts
import { Context } from "@max/core";
import type { AcmeClientProvider } from "./acme-client.js";

export class AcmeAppContext extends Context {
  api = Context.instance<AcmeClientProvider>();
  workspaceId = Context.string;
}
```

**Pattern:** Extend `Context`, use typed descriptors as field initializers.

| Descriptor | Use |
|------------|-----|
| `Context.instance<T>()` | Object instance (API client, service) |
| `Context.string` | String value |
| `Context.number` | Number value |
| `Context.boolean` | Boolean value |

The context is hydrated later in `ConnectorModule.initialise()` (section 10).

---

## 4. Set Up Credentials

Credentials are typed references to secrets your connector needs. They're stored separately from config - never mixed into the config object.

### Simple keys (API tokens)

```typescript
// connectors/connector-acme/src/credentials.ts
import { Credential } from "@max/connector";

export const AcmeApiToken = Credential.string("api_token");
```

### OAuth pairs (access/refresh tokens)

```typescript
import { Credential } from "@max/connector";

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

Credentials are collected during onboarding (section 9) and consumed during initialisation (section 10).

---

## 5. How Sync Works

Before diving into loaders and resolvers, it helps to understand how the pieces fit together at runtime.

When Max syncs a connector, three systems cooperate:

1. **Seeder** produces a **SyncPlan** - an ordered list of steps like "discover all workspaces", "load user fields", etc.
2. The sync engine walks each step. For a `loadFields` step, it looks up the **Resolver** for that entity type, which maps each field to a **Loader**.
3. The engine calls the loader, which hits your API and returns data as `EntityInput` values. The engine stores these, then moves to the next step.

```
SyncPlan          Resolver              Loader              Your API
  |                 |                     |                    |
  |-- step 1 -----> |                     |                    |
  |  "load user     |-- displayName? ---> |                    |
  |   fields"       |-- email? ---------> |  (same loader)     |
  |                 |                     |--- getUser(id) --> |
  |                 |                     |<-- { ... } --------|
  |                 |                     |                    |
  |-- step 2 -----> |                     |                    |
  |  "load user     |-- users? ---------> |                    |
  |   collection"   |                     |--- listUsers() --> |
  |                 |                     |<-- [...] ----------|
```

The key insight: **resolvers are the wiring layer**. They don't contain logic - they just tell the engine which loader to call for each field. This means a single loader can serve multiple fields (one API call populates many fields), and the engine can be smart about batching.

With that in mind, let's build the loaders and resolvers.

---

## 6. Create Loaders

Loaders fetch data from your API and return `EntityInput` values.

### Entity loader

Fetches fields for a single entity by ref:

```typescript
// connectors/connector-acme/src/resolvers/user-resolver.ts
import { Loader, EntityInput } from "@max/core";
import { AcmeUser } from "../entities.js";
import { AcmeAppContext } from "../context.js";

const UserBasicLoader = Loader.entity({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,
  strategy: "autoload",

  async load(ref, ctx) {
    const user = await ctx.api.client.getUser(ref.id);
    return EntityInput.create(ref, {
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      active: user.active,
    });
  },
});
```

### Batched entity loader

Fetches fields for many entities in a single API call. Preferred when the API supports batch retrieval:

```typescript
const UserBatchLoader = Loader.entityBatched({
  name: "acme:user:batch",
  context: AcmeAppContext,
  entity: AcmeUser,

  async load(refs, ctx) {
    const users = await ctx.api.client.getUserBatch(refs.map(r => r.id));
    return Batch.buildFrom(
      users.map(u => EntityInput.create(AcmeUser.ref(u.id), {
        displayName: u.displayName,
        email: u.email,
      }))
    ).withKey(input => input.ref);
  },
});
```

### Collection loader

Fetches a paginated list of child entities belonging to a parent:

```typescript
// connectors/connector-acme/src/resolvers/workspace-resolver.ts
const WorkspaceUsersLoader = Loader.collection({
  name: "acme:workspace:users",
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeUser,

  async load(ref, page, ctx) {
    const users = await ctx.api.client.listUsers(ref.id);
    const items = users.map(u =>
      EntityInput.create(AcmeUser.ref(u.id), {})
    );
    return Page.from(items, false, undefined);
  },
});
```

The `page` parameter carries `cursor` and `limit` for APIs that paginate. Return `Page.from(items, hasMore, nextCursor)` - the engine automatically follows pagination when `hasMore` is true.

**Choosing page size:** Pick the largest page size the API allows. Fewer round-trips means faster syncs - a connector fetching 100 items per page makes 10x fewer API calls than one fetching 10. Check your API's rate limits and maximum allowed `limit` parameter, and default to that upper bound.

### Loader variants

| Factory | Signature | Use case |
|---------|-----------|----------|
| `Loader.entity()` | `(ref, ctx) => EntityInput` | Fetch one entity |
| `Loader.entityBatched()` | `(refs[], ctx) => Batch<EntityInput>` | Fetch many in one call |
| `Loader.collection()` | `(parentRef, page, ctx) => Page<EntityInput>` | Paginated children |

For sources that return data for multiple entity types in one call, see [Source + Derivation](#12-advanced-source--derivation).

---

## 7. Create Resolvers

A resolver maps an entity's fields to the loaders that populate them. Each field points to exactly one loader.

```typescript
import { Resolver } from "@max/core";

const AcmeUserResolver = Resolver.for(AcmeUser, {
  displayName: UserBasicLoader.field("displayName"),
  email: UserBasicLoader.field("email"),
  role: UserBasicLoader.field("role"),
  active: UserBasicLoader.field("active"),
});
```

Multiple fields can share a loader - when the engine needs `displayName` and `email`, it sees both map to `UserBasicLoader` and makes a single call.

For collection fields, call `.field()` with no argument:

```typescript
const AcmeWorkspaceResolver = Resolver.for(AcmeWorkspace, {
  name: WorkspaceBasicLoader.field("name"),
  users: WorkspaceUsersLoader.field(),
  projects: WorkspaceProjectsLoader.field(),
});
```

---

## 8. Create Seeder & SyncPlan

The seeder bootstraps a sync from cold start. It stores an initial root entity and returns a plan describing what to sync and in what order.

```typescript
// connectors/connector-acme/src/seeder.ts
import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { AcmeRoot, AcmeWorkspace, AcmeUser, AcmeProject, AcmeTask } from "./entities.js";
import { AcmeAppContext } from "./context.js";

export const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    // Store the root entry point. This is the top-level anchor for the
    // connector's entity graph - the sync plan fans out from here.
    // You could also store connector-level metadata on the root entity
    // (e.g. workspace name, account info) if your schema defines those fields.
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all workspaces from root
      Step.forRoot(rootRef).loadCollection("workspaces"),
      // 2. Load workspace names
      Step.forAll(AcmeWorkspace).loadFields("name"),
      // 3. Discover users and projects per workspace (independent, so concurrent)
      Step.concurrent([
        Step.forAll(AcmeWorkspace).loadCollection("users"),
        Step.forAll(AcmeWorkspace).loadCollection("projects"),
      ]),
      // 4. Load details (these depend on step 3 having discovered the entities)
      Step.concurrent([
        Step.forAll(AcmeUser).loadFields("displayName", "email", "role", "active"),
        Step.forAll(AcmeProject).loadFields("name", "description", "status", "owner"),
      ]),
      // 5. Discover tasks per project
      Step.forAll(AcmeProject).loadCollection("tasks"),
    ]);
  },
});
```

### Step targets

| Target | Meaning |
|--------|---------|
| `Step.forRoot(ref)` | A single known root entity |
| `Step.forAll(EntityDef)` | All entities of this type in the store |
| `Step.forOne(ref)` | A single known entity |

### Step operations

| Operation | Meaning |
|-----------|---------|
| `.loadFields("a", "b")` | Load named fields via their resolvers |
| `.loadCollection("field")` | Load a collection field (paginated) |

Steps run sequentially by default - each waits for the previous step to finish. This matters because later steps depend on entities discovered by earlier ones (e.g., step 3 discovers users that step 4 then loads fields for).

Use `Step.concurrent()` to run independent steps in parallel, as shown in the seeder example above. The rule of thumb: if two steps don't depend on each other's discovered entities, they can be concurrent.

---

## 9. Define Onboarding

Onboarding is the step-by-step flow users go through when installing your connector. It collects configuration and credentials, then validates connectivity.

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

### Step types

All step types are available on `OnboardingFlow`:

| Step | Purpose |
|------|---------|
| `OnboardingFlow.InputStep` | Collect fields and credentials from the user |
| `OnboardingFlow.ValidationStep` | Test connectivity / credentials (async) |
| `OnboardingFlow.SelectStep` | Dynamic dropdown populated from an API call |
| `OnboardingFlow.CustomStep` | Arbitrary async work (receives `prompter` for user I/O) |

Each has `.create(opts)` and `.after(prevStep, opts)`. Use `.after()` whenever a step's callbacks need to reference values from earlier steps.

### Typed accumulated state

When you use `.after(prevStep, ...)`, callbacks receive a typed `accumulated` parameter based on what previous steps collected:

- **InputStep** fields are inferred from their descriptors (`type: 'string'` becomes `string`)
- **SelectStep** adds `{ [field]: string }` from the user's selection
- **ValidationStep** passes the accumulated type through unchanged
- **CustomStep** extends it with whatever the `execute` function returns

This means `acc.baseUrl` in the example above is `string` - no casts needed.

### Dynamic descriptions

`InputStep.description` can be a string or a function of accumulated state. Use a function when instructions need to reference values from earlier steps (e.g. embedding a tenant URL into setup links):

```typescript
description: (acc) => `Create a token at ${acc.baseUrl}/settings/api-keys`
```

### CustomStep and prompter

`CustomStep` receives an `OnboardingPrompter` for displaying messages and asking questions during arbitrary async work (e.g. an OAuth browser flow):

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

**Key principle:** Credentials flow into `credentialStore` during onboarding and are never mixed into the config object. Config holds non-secret values (URLs, workspace IDs). Secrets are accessed through `CredentialProvider` handles at runtime.

### Config type

The config type is plain data - whatever your onboarding flow produces:

```typescript
// connectors/connector-acme/src/config.ts
export interface AcmeConfig {
  readonly baseUrl: string;
  readonly workspaceId: string;
}
```

---

## 10. Wire It Together

Three pieces assemble into the final connector: `ConnectorDef` (static descriptor), `ConnectorModule` (factory), and `Installation` (live instance).

### ConnectorDef

Ties schema, resolvers, seeder, and onboarding into a single descriptor:

```typescript
// connectors/connector-acme/src/index.ts
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { Context } from "@max/core";

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
});
```

### ConnectorModule

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

---

## 11. Package Setup

### Where connectors live

Connectors live in a **connector collection** - a directory (or repo) containing one or more `connector-*` folders. You can put a collection anywhere; it doesn't need to be inside the Max monorepo.

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
├── package.json            # Workspace root with catalog
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

The `link:` entries in the catalog resolve to your local Max checkout via `bun link`. When you run `bun install` in the Max monorepo, it automatically links `@max/core` and `@max/connector` as global packages. Running `bun install` in your collection then picks them up.

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

Use `"catalog:"` for `@max/core` and `@max/connector` - this resolves through the collection root's catalog to the `link:` references. Point both `types` and `default` exports to source.

---

## 12. Advanced: Source + Derivation

### The problem

When designing entity models you face a trade-off:

- **Flat:** One paginated collection on the root. Efficient to sync (single cursor), but you lose relational structure.
- **Hierarchical:** Parent entities with child collections (e.g., Workspace -> Users). Rich structure, but sync becomes m x n - one loader call per parent, each paginates children.

Source + Derivation eliminates this trade-off: one pagination pass, multiple entity types.

### How it works

A **Source** owns a single paginated API call and returns raw data. **Derivations** are pure functions that each extract one entity type from the source output. The engine runs all co-derivations on each page automatically.

```typescript
// Source - one paginated API call
const IssuesPageSource = Loader.paginatedSource({
  name: "github:repo:issues-page",
  context: GithubContext,
  parent: GithubRepo,
  async fetch(ref, page, ctx) {
    const result = await ctx.api.issues.list(ref.id, { cursor: page.cursor });
    return SourcePage.from(result, result.hasMore, result.cursor);
  },
});

// Primary derivation - issues
const RepoIssuesLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "github:repo:issues",
  target: GithubIssue,
  extract(data) {
    return data.issues.map(i =>
      EntityInput.create(GithubIssue.ref(i.id), {
        title: i.title,
        state: i.state,
        creator: GithubUser.ref(i.creator.id),
      })
    );
  },
});

// Co-derivation - authors extracted from the same data, no extra API call
const IssueAuthorsLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "github:repo:issue-authors",
  target: GithubUser,
  extract(data) {
    const seen = new Set();
    return data.issues
      .filter(i => !seen.has(i.creator.id) && seen.add(i.creator.id))
      .map(i =>
        EntityInput.create(GithubUser.ref(i.creator.id), {
          login: i.creator.login,
        })
      );
  },
});
```

The sync plan only needs a step for the primary derivation - co-derivations run automatically:

```typescript
SyncPlan.create([
  Step.forRoot(rootRef).loadCollection("repos"),
  Step.forAll(GithubRepo).loadCollection("issues"),
  // No step needed for issueAuthors - handled by co-derivation
]);
```

### When to use it

The numbers matter here. Consider a connector with 1,000 repos, each with 1,000 issues. A hierarchical model using `Step.forAll(GithubRepo).loadCollection("issues")` triggers one paginated loader call per repo - that's 1,000 API calls minimum (more with pagination). If each issue also implies an author entity and you use `Step.forAll(GithubIssue).loadCollection("author")`, that's another 1,000,000 calls. Total: over a million API calls.

With Source + Derivation, you make 1,000 paginated calls (one per repo), and each page yields both issues and authors. The million-call problem drops to a thousand.

**Use it when:**
- A single API endpoint returns data for multiple entity types
- Your sync plan would have `Step.forAll(X).loadCollection(Y)` where X could have thousands of instances

**Don't use it when:**
- Each entity type has its own efficient, dedicated endpoint
- The API itself requires per-parent calls (e.g., the only way to get members is `GET /groups/:id/members`)

### Source variants

| Factory | Signature | Use case |
|---------|-----------|----------|
| `Loader.paginatedSource()` | `(ref, page, ctx) => SourcePage<TData>` | Paginated API calls |
| `Loader.singleSource()` | `(ref, ctx) => TData` | Non-paginated API calls |

Both can be consumed by `Loader.deriveEntities()`.

---

## File Structure

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

---

## Quick Reference

```typescript
// Entities
EntityDef.create("Name", { field: Field.string() })

// Fields
Field.string()          Field.number()          Field.boolean()
Field.date()            Field.ref(Target)       Field.collection(Target)
Field.refThunk(() => Target)  // breaks circular references

// Schema
Schema.create({ namespace: "acme", entities: [...], roots: [...] })

// Context
class MyContext extends Context {
  api = Context.instance<ApiClient>();
  tenantId = Context.string;
}

// Credentials
Credential.string("api_token")
Credential.oauth({ refreshToken, accessToken, expiresIn, refresh })

// Loaders
Loader.entity({ name, context, entity, load: async (ref, ctx) => EntityInput })
Loader.entityBatched({ name, context, entity, load: async (refs, ctx) => Batch })
Loader.collection({ name, context, entity, target, load: async (ref, page, ctx) => Page })
Loader.paginatedSource({ name, context, parent, fetch: async (ref, page, ctx) => SourcePage })
Loader.singleSource({ name, context, parent, fetch: async (ref, ctx) => TData })
Loader.deriveEntities(source, { name, target, extract: (data) => EntityInput[] })

// Resolver
Resolver.for(Entity, { field: SomeLoader.field("field"), collection: CollLoader.field() })

// Seeder
Seeder.create({ context, seed: async (ctx, engine) => SyncPlan })

// SyncPlan
SyncPlan.create([
  Step.forRoot(ref).loadCollection("children"),
  Step.forAll(Entity).loadFields("a", "b"),
  Step.concurrent([...]),
])

// Onboarding (step references with .after() for typed accumulated state)
const step1 = OnboardingFlow.InputStep.create({ label, fields, credentials })
const step2 = OnboardingFlow.ValidationStep.after(step1, { label, validate: async (acc, ctx) => {} })
const step3 = OnboardingFlow.SelectStep.after(step2, { label, field, options: async (acc, ctx) => [...] })
OnboardingFlow.create<TConfig>([step1, step2, step3])

// ConnectorDef
ConnectorDef.create<TConfig>({
  name, displayName, description, icon, version, scopes,
  schema, onboarding, seeder, resolvers,
})

// ConnectorModule
ConnectorModule.create<TConfig>({
  def: myDef,
  initialise(config, credentials) {
    return Installation.create({ context, start, stop, health });
  },
})
```

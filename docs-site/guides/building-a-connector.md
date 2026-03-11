# Building a Connector

Step-by-step guide to building a Max connector that syncs data from an upstream API.

## File structure

A connector lives in its own package:

```
connectors/connector-acme/
├── src/
│   ├── entities.ts          # Entity definitions
│   ├── schema.ts            # ConnectorSchema
│   ├── credentials.ts       # Credential declarations
│   ├── context.ts           # Context (API client, config)
│   ├── seeder.ts            # Cold-start sync plan
│   ├── resolvers/
│   │   ├── user-resolver.ts # Loaders + resolver
│   │   └── index.ts         # Re-exports
│   └── index.ts             # ConnectorDef + main exports
└── package.json
```

## 1. Define entities

Entities are the data objects your connector syncs — Users, Tasks, Teams, etc.

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField } from "@max/core";

// ---cut-before---
interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  isAdmin: ScalarField<"boolean">;
}> {}

const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
  isAdmin: Field.boolean(),
});
```

This uses the [Type + Companion Object](/concepts/core-types) pattern — `AcmeUser` is both a type and a value.

## 2. Define context

Context holds dependencies that loaders need — API clients, config, etc.

```typescript twoslash
// @noErrors
import { Context } from "@max/core";

// ---cut-before---
class AcmeAppContext extends Context {
  api = Context.instance<{ users: { getBatch(ids: string[]): Promise<any[]> } }>();
  installationId = Context.string;
}
```

## 3. Create loaders

Loaders fetch data from your upstream API.

```typescript twoslash
// @noErrors
import { Loader, EntityInput, Batch, EntityDef, Field, ScalarField, Context } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});
class AcmeAppContext extends Context {
  api = Context.instance<{ users: { getBatch(ids: string[]): Promise<{ id: string; name: string; email: string }[]> } }>();
}

// ---cut-before---
const BasicUserLoader = Loader.entityBatched({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,

  async load(refs, ctx, deps) {
    const ids = refs.map(r => r.id);
    const users = await ctx.api.users.getBatch(ids);

    return Batch.buildFrom(
      users.map(user =>
        EntityInput.create(AcmeUser.ref(user.id), {
          name: user.name,
          email: user.email,
        })
      )
    ).withKey(input => input.ref);
  }
});
```

**Loader types:**

`Loader.entity()`
:   Single ref → EntityInput

`Loader.entityBatched()`
:   Multiple refs → Batch (more efficient)

`Loader.collection()`
:   Parent ref → Page of child refs

`Loader.raw()`
:   Arbitrary data (config, metadata)

## 4. Create resolver

A resolver maps entity fields to loaders:

```typescript twoslash
// @noErrors
import { Resolver, Loader, EntityDef, Field, ScalarField, Context, EntityInput, Batch } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  isAdmin: ScalarField<"boolean">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
  isAdmin: Field.boolean(),
});
class AcmeAppContext extends Context {
  api = Context.instance<any>();
}
const BasicUserLoader = Loader.entityBatched({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,
  async load(refs: any, ctx: any, deps: any) { return Batch.buildFrom([]).withKey((input: any) => input.ref); }
});

// ---cut-before---
const AcmeUserResolver = Resolver.for(AcmeUser, {
  name: BasicUserLoader.field("name"),
  email: BasicUserLoader.field("email"),
  isAdmin: BasicUserLoader.field("isAdmin"),
});
```

Multiple fields can point to the same loader — batching is automatic.

## 5. Define schema

`ConnectorSchema` declares your connector's data model:

```typescript twoslash
// @noErrors
import { ConnectorSchema } from "@max/connector";

// ---cut-before---
const AcmeSchema = ConnectorSchema.create({
  namespace: "acme",
  entities: [/* AcmeUser, AcmeTeam, AcmeRoot */],
  roots: [/* AcmeRoot */],
});
```

`roots` are the entry points for sync — entities that don't depend on a parent.

## 6. Set up credentials

```typescript twoslash
// @noErrors
import { Credential } from "@max/connector";

// ---cut-before---
// Simple API key
const ApiToken = Credential.string("api_token");

// OAuth (auto-refresh)
const GoogleAuth = Credential.oauth({
  refreshToken: "refresh_token",
  accessToken: "access_token",
  expiresIn: 3500,
  async refresh(refreshToken) {
    // Call your OAuth provider's refresh endpoint
    return { accessToken: "new-token" };
  },
});
```

## 7. Create ConnectorDef

Tie it all together:

```typescript twoslash
// @noErrors
import { ConnectorDef } from "@max/connector";

// ---cut-before---
const AcmeDef = ConnectorDef.create({
  name: "acme",
  displayName: "Acme",
  description: "Sync users and teams from Acme",
  icon: "https://acme.com/icon.svg",
  version: "1.0.0",
  scopes: ["read:users", "read:teams"],
  schema: undefined as any,   // AcmeSchema
  seeder: undefined as any,   // AcmeSeeder
  resolvers: [],               // [AcmeUserResolver, ...]
});
```

Export your `ConnectorDef` as the default export of your package — Max discovers connectors by loading their main entry point.

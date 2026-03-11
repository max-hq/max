# Scope

**Scope** defines the installation context for refs and entities. It determines how Max objects are addressed across different deployment models.

## LocalScope

Single installation — no installation ID needed. This is the default for developer laptops.

```typescript twoslash
// @noErrors
import { Scope } from "@max/core";

// ---cut-before---
const local = Scope.local();
```

## SystemScope

Multi-tenant — requires an installation ID to distinguish entities across tenants.

```typescript twoslash
// @noErrors
import { Scope } from "@max/core";

// ---cut-before---
const system = Scope.system("inst_456");
```

## Why scope matters

In **local mode** (developer laptop), everything is local scope — one installation, no ambiguity.

In **system mode** (enterprise deployment), refs carry installation IDs to distinguish entities across tenants.

## Scope in type signatures

Refs are polymorphic over scope. The default generic parameter means "any scope" — which is what you want in most code:

```typescript
Ref<AcmeUser>              // Any scope (default) — use in most code
Ref<AcmeUser, LocalScope>  // Explicitly local — use at boundaries
Ref<AcmeUser, SystemScope> // Explicitly system — use at boundaries
```

## Scope upgrade

When data moves from local to system context, refs need to be **upgraded** — attaching the installation ID:

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField, Scope } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
});

// ---cut-before---
const localRef = AcmeUser.ref("u1");
const systemRef = localRef.upgradeScope(Scope.system("inst_456"));
```

Most code uses local scope. System scope is for multi-tenant deployments where the same entity type exists across multiple installations.

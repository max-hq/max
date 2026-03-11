# Utilities

Core utility types and functions available from `@max/core`.

## Batch

Ordered key-value container for batched loader results.

```typescript twoslash
// @noErrors
import { Batch, EntityInput, EntityDef, Field, ScalarField, Ref } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
});

// ---cut-before---
const batch = Batch.buildFrom([
  EntityInput.create(AcmeUser.ref("u1"), { name: "Alice" }),
  EntityInput.create(AcmeUser.ref("u2"), { name: "Bob" }),
]).withKey(input => input.ref);
```

Used in `Loader.entityBatched` to return results keyed by ref.

## Page

Paginated result container:

```typescript twoslash
// @noErrors
import { Page, Ref, EntityDef, Field, ScalarField } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
});

// ---cut-before---
const page = Page.of([
  AcmeUser.ref("u1"),
  AcmeUser.ref("u2"),
], { cursor: "next-page-token" });
```

When `cursor` is present, the framework knows there are more pages to fetch.

## Fields

Type-safe field selection:

```typescript twoslash
// @noErrors
import { Fields, EntityDef, Field, ScalarField } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});

// ---cut-before---
Fields.select<AcmeUser>("name", "email");
Fields.ALL;
```

## Brands

Nominal typing without runtime overhead.

### SoftBrand (Id)

Allows naked string assignment — use for most IDs:

```typescript
type EntityId = Id<"entity-id">;
const id: EntityId = "u123";  // ✅ Works
```

### HardBrand

Requires a factory function — use for validated/constructed values:

```typescript
type RefKey = HardBrand<string, "ref-key">;
const key: RefKey = "...";        // ❌ Error
const key = RefKey.from("...");   // ✅ Must use factory
```

## MaxError

Composable error system with boundaries and facets:

```typescript twoslash
// @noErrors
import { MaxError } from "@max/core";

// ---cut-before---
const error = MaxError.create("Something went wrong", {
  boundary: "connector",
  code: "UPSTREAM_UNAVAILABLE",
});
```

Errors carry structured metadata — boundary (which subsystem), code, and optional data facets — making them easy to handle programmatically.

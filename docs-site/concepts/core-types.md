# Core Types

Max's type system is built around a few fundamental primitives. These use the **Type + Companion Object** pattern — a single name works as both a TypeScript type and a runtime value.

## EntityDef

An `EntityDef` defines an entity type and its fields.

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField } from "@max/core";

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

The `interface` + `const` with the same name is the companion object pattern. `AcmeUser` works as:

- **Type** — `Ref<AcmeUser>`, `EntityInput<AcmeUser>`
- **Value** — `AcmeUser.ref("u1")`, `AcmeUser.entityType`

## Ref

A **Ref** is a typed reference to an entity instance.

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField, Ref } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
});

// ---cut-before---
// Create a ref
const userRef = AcmeUser.ref("u123");

userRef.entityType;  // "AcmeUser"
userRef.id;          // "u123"
```

Refs are rich objects that carry the entity type (at runtime), the entity ID, and scope information.

## EntityInput

A complete upsert payload — a ref plus its field values.

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField, EntityInput } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});

// ---cut-before---
const input = EntityInput.create(AcmeUser.ref("u1"), {
  name: "Alice",
  email: "alice@example.com",
});
```

Loaders return `EntityInput` — it's the standard unit of data flowing through the sync pipeline.

## EntityResult

Returned when loading entities from the engine. Provides type-safe access to only the fields you requested.

```typescript twoslash
// @noErrors
import { EntityDef, Field, ScalarField, Fields } from "@max/core";

interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}
const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});

// ---cut-before---
// Only loaded fields are accessible — type-safe partial loading
const fields = Fields.select<AcmeUser>("name", "email");
```

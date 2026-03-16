---
title: Meta Fields
sidebar:
  order: 2
---

Meta fields are Max-provided virtual fields available on every entity, regardless of the connector's schema definition. They use the `_` prefix, which is reserved - connectors cannot define schema fields starting with `_`.

## Available Meta Fields

| Field  | Description                    | Default visible | Filterable |
|--------|--------------------------------|-----------------|------------|
| `_id`  | Raw entity ID                  | Yes             | Yes        |
| `_ref` | Scoped reference key           | No              | No         |

### `_id` - the entity's identity

The raw identifier for this entity within its entity type. This is the value that the connector lifted from the source system - e.g., `user-abc123` from Linear, or a Google Drive file ID.

`_id` is the entity's *noun* - its identity. It is invariant across federation layers. If two installations both sync the same Linear workspace, the same user has the same `_id` in both.

In SQLite storage, `_id` maps directly to the `_id TEXT PRIMARY KEY` column.

### `_ref` - the entity's address

The scoped reference key encoding entity type, ID, and scope routing context. At the installation layer this looks like `ein:LinearUser:user-abc123`. At higher federation layers, it includes additional routing (installation ID, workspace ID).

`_ref` is the entity's *address* - it changes as you cross scope boundaries. Two installations syncing the same user will produce different `_ref` values because the scope context differs.

`_ref` is opt-in (not shown by default) because it is verbose and primarily useful for programmatic consumption or debugging.

## How they relate to Ref

An entity's `Ref` object is the runtime representation that contains both pieces:

- `ref.id` - the raw ID (what `_id` exposes)
- `ref.toKey()` - the scoped reference key (what `_ref` exposes)

Meta fields make these values addressable in the same namespace as schema fields - in filters, field selection, and output.

## Underscore reservation

Field names starting with `_` are reserved for Max meta fields. `EntityDef.create()` will throw `ErrReservedFieldPrefix` at runtime if a connector attempts to define a field with this prefix.

This gives Max a clean namespace for system-provided properties without risk of collision with connector schema fields. Future meta fields (e.g., `_createdAt`, `_updatedAt`) can be added to the registry without breaking existing schemas.

## CLI usage

```bash
# _id appears in default output (no --fields needed)
max search linear-1 LinearUser --limit=5

# Explicit field selection including meta fields
max search linear-1 LinearUser --fields=_id,displayName,email

# Opt into _ref (directly)
max search linear-1 LinearUser --fields=_id,_ref,displayName

# Optionally: Opt into _ref and _id (or all meta fields) via .meta group selector
max search linear-1 LinearUser --fields=.meta,displayName

# All meta + all properties
max search linear-1 LinearUser --fields=.all

# Filter by _id
max search linear-1 LinearUser --filter="_id=user-abc123"
```

See [Field Selection](/reference/data-model/field-selection/) for the full guide on `--fields` and group selectors.

## Federation semantics

When searching across federation layers:

- `_id` penetrates federation - it's the invariant identity. Filtering by `_id=user-abc123` reaches the storage layer as a simple `WHERE _id = ?` regardless of which node handles the query.
- `_ref` is layer-specific - it transforms at each scope boundary. The ref you see depends on which federation node you're querying from.

This distinction matters for cross-installation queries: two installations can have the same `_id` for the same source entity, but will always have different `_ref` values.

## Implementation

Meta fields are defined centrally in `@max/core` via the `MetaField` registry (`meta-fields.ts`). `EntityResult` resolves them at runtime from its `ref` - they never exist in the field data map. The `MetaField.resolve(name, result)` function dispatches to the appropriate resolver.

The storage layer (sqlite / other) stores the raw entity ID in the `_id` column. The engine's `getColumn()` method recognises `_id` as a synthetic column, enabling filters and ordering against it.

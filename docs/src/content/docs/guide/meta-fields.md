---
title: Meta Fields
sidebar:
  order: 4
---

Every entity in Max has a set of built-in fields alongside the connector-defined schema fields. These are called meta fields, and they use the `_` prefix. You can select them, filter by them, and use them in output just like any other field.

## Available Meta Fields

| Field  | Description                    | Default visible | Filterable |
|--------|--------------------------------|-----------------|------------|
| `_id`  | Raw entity ID                  | Yes             | Yes        |
| `_ref` | Scoped reference key           | No              | No         |

### `_id` - the entity's identity

The raw identifier for this entity within its entity type. This is the value that the connector pulled from the source system - for example, `user-abc123` from Linear, or a Google Drive file ID.

`_id` is stable across installations. If two installations both sync the same Linear workspace, the same user has the same `_id` in both. Use `_id` for filtering, lookups, and joining across entity types.

### `_ref` - the entity's address

An opaque scoped reference key that encodes routing context for the entity. Treat it as an opaque string - don't parse or introspect its contents.

`_ref` is opt-in (not shown by default) because it's verbose and primarily useful for programmatic consumption or debugging. Unlike `_id`, `_ref` values differ across installations even for the same underlying entity.

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

See [Field Selection](/guide/field-selection/) for the full guide on `--fields` and group selectors.

## When to use each

- **Use `_id`** for filtering, lookups, and joining across entity types. It's the stable identity.
- **Use `_ref`** when you need a fully-qualified address for programmatic use or debugging. Treat it as opaque - don't parse it.

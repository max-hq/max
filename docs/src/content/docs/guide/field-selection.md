---
title: Field Selection
sidebar:
  order: 3
---

The `--fields` flag controls which columns appear in search output. When omitted, you get `_id` plus all schema properties - the sensible default for most queries.

```bash
# Default output: _id + all schema properties
max search linear-1 LinearUser --limit=5

# Pick specific fields
max search linear-1 LinearUser --fields=_id,displayName,email
```

The catch with explicit field selection is that it's all-or-nothing - once you specify `--fields`, you only get what you list. This makes it awkward when you want the default output *plus* one extra field like `_ref`.

## Group selectors

Group selectors solve this. They're dot-prefixed keywords that expand to a set of fields:

| Selector | Expands to                              |
|----------|-----------------------------------------|
| `.props` | All schema-defined properties           |
| `.meta`  | All meta fields (`_id`, `_ref`, ...)    |
| `.all`   | `.meta` + `.props`                      |

Group selectors can be mixed freely with individual field names:

```bash
# Everything - all meta fields and all properties
max search linear-1 LinearUser --fields=.all

# Default output plus _ref
max search linear-1 LinearUser --fields=_id,.props

# All meta fields, but only specific properties
max search linear-1 LinearUser --fields=.meta,displayName,email

# Same as .all
max search linear-1 LinearUser --fields=.meta,.props
```

Duplicates are removed automatically, so `.all,_id` won't show `_id` twice.

## Field namespaces

Field names occupy three distinct namespaces, each with its own prefix convention:

- **Bare names** (`displayName`, `email`) - schema properties defined by the connector
- **Underscore prefix** (`_id`, `_ref`) - meta fields provided by Max on every entity
- **Dot prefix** (`.props`, `.meta`, `.all`) - group selectors that expand to sets of fields

## How it works

Field selection is purely a display concern. The engine always fetches all data from storage; `--fields` controls which columns the printer renders. This means group selectors are expanded at the CLI layer before reaching the printer - the engine and storage layer are unaware of them.

The default output (no `--fields`) is equivalent to `--fields=_id,.props`.

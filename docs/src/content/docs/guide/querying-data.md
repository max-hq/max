---
title: Querying Data
sidebar:
  order: 2
---

Once you've synced a data source, you can query it with `max search`. All queries run against your local store - they're fast, free, and you can run as many as you want.

## Basic search

```bash
max search linear-1 LinearIssue --limit 5
```

```
LinearIssue: 5 results, more available

  _id        identifier  title                        state
  001b2c..   ATL-811     Validate TinyBird POC        Done
  00482b..   MET-3898    Delete redshift cluster 1    Done
  005610..   FEA-98      Feature Improvement: FP...   Canceled
  007a12..   ATL-455     Update staging config        In Progress
  009f3e..   BUG-221     Fix login redirect loop      Todo

Next page: --after ein:LinearIssue:009f3e...
```

By default, search returns `_id` plus all schema-defined fields in a table format.

## Filtering results

Use `--filter` (or `-f`) to narrow results with boolean expressions:

```bash
# Exact match
max search linear-1 LinearIssue -f 'state=Done'

# Comparison
max search linear-1 LinearIssue -f 'priority > 2'

# Pattern match (substring)
max search linear-1 LinearIssue -f 'title~="Zendesk"'

# Compound filters
max search linear-1 LinearIssue -f 'state=Done AND priority > 2'

# Grouped conditions
max search linear-1 LinearIssue -f '(state=Todo OR state="In Progress") AND priority >= 3'
```

### Filter operators

| Operator | Meaning |
|----------|---------|
| `=` | Equals |
| `!=` | Not equals |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `~=` | Pattern match (substring) |

Combine expressions with `AND` and `OR`. Use parentheses to control grouping.

Quote the filter string to prevent shell interpretation. Use inner quotes for values with spaces: `--filter 'state="In Progress"'`.

## Choosing fields

Use `--fields` to control which columns appear in output:

```bash
# Specific fields only
max search linear-1 LinearIssue --fields="title,state,assignee"

# All schema properties (no meta fields)
max search linear-1 LinearIssue --fields=".props"

# All meta fields (_id, _ref)
max search linear-1 LinearIssue --fields=".meta"

# Everything
max search linear-1 LinearIssue --fields=".all"

# Mix named fields with selectors
max search linear-1 LinearIssue --fields="_id,title,.meta"
```

When you omit `--fields`, you get `_id` plus all schema properties - equivalent to `--fields="_id,.props"`.

See [Field Selection](/guide/field-selection/) for the full guide on selectors and namespaces.

## Ordering

Sort results with `--order-by`:

```bash
# Ascending (default)
max search linear-1 LinearIssue --order-by priority

# Descending
max search linear-1 LinearIssue --order-by priority:desc

# Explicit ascending
max search linear-1 LinearIssue --order-by identifier:asc
```

## Output formats

Max supports three output formats. See [Output and Pagination](/cli/output-and-pagination/) for full details.

**`text`** (default) - human-readable table, good for exploration.

**`json`** - single JSON object with a `data` array and pagination metadata:

```bash
max search linear-1 LinearIssue --limit 2 -o json
```

```json
{
  "type": "LinearIssue",
  "data": [
    { "_id": "001b...", "identifier": "ATL-811", "title": "...", "state": "Done" },
    { "_id": "004b...", "identifier": "MET-3898", "title": "...", "state": "Done" }
  ],
  "hasMore": true,
  "cursor": "ein:LinearIssue:00482baa-..."
}
```

**`ndjson`** - one JSON object per line, with a `_meta` line at the end. Good for piping:

```bash
max search linear-1 LinearIssue --limit 2 -o ndjson
```

```
{"_id":"001b...","identifier":"ATL-811","title":"...","state":"Done"}
{"_id":"004b...","identifier":"MET-3898","title":"...","state":"Done"}
{"_meta":{"type":"LinearIssue","hasMore":true,"cursor":"ein:LinearIssue:00482baa-..."}}
```

## Discovering your schema

Use `max schema` to see what entity types and fields are available for a connector:

```bash
max schema @max/connector-linear
```

<!-- TODO: verify exact schema output format -->

To find out which connector an installation uses, check its status:

```bash
max -t my-project/linear-1 status
```

## Composing with shell tools

Machine-readable output formats make it easy to pipe Max output into other tools:

```bash
# Count open issues
max search linear-1 LinearIssue -f 'state=Todo' --all -o ndjson | wc -l

# Extract titles with jq
max search linear-1 LinearIssue --limit 10 -o json | jq '.data[].title'

# Export to CSV
max search linear-1 LinearIssue --all -o ndjson \
  | jq -r '[.identifier, .title, .state] | @csv'

# Find issues mentioning a keyword
max search linear-1 LinearIssue --all -f 'title~="migration"' --fields="identifier,title" -o ndjson
```

Use `--all` to auto-paginate and stream all results. There's no practical cost to large result sets since everything runs locally.

## What's next

- [Field Selection](/guide/field-selection/) - group selectors and field namespaces
- [Meta Fields](/guide/meta-fields/) - built-in fields like `_id` and `_ref`
- [Output and Pagination](/cli/output-and-pagination/) - formats, pagination, and piping
- [Agent Integration](/guide/agent-integration/) - using Max with AI agents

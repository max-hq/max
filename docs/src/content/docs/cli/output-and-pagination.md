---
title: Output and Pagination
sidebar:
  order: 4
---

Max commands that return data support multiple output formats and cursor-based pagination. Choose the format that fits your use case - table for exploration, JSON for scripting, NDJSON for streaming.

## Output formats

Control the format with `-o` or `--output`:

### Table (default)

Human-readable columns with automatic sizing. Best for interactive use:

```bash
max search linear-1 LinearIssue --limit 3
```

```
LinearIssue: 3 results, more available

  _id        identifier  title                        state
  001b2c..   ATL-811     Validate TinyBird POC        Done
  00482b..   MET-3898    Delete redshift cluster 1    Done
  005610..   FEA-98      Feature Improvement: FP...   Canceled

Next page: --after ein:LinearIssue:005610bf-...
```

Column widths are calculated from the first 20 rows. Long values are truncated with ellipsis (max 80 characters per column).

### JSON

A single JSON object with all results and pagination metadata. Best for programmatic consumption:

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

The `data` array contains all entities. `hasMore` and `cursor` tell you whether there are more results and how to get them.

### NDJSON

One JSON object per line, with a `_meta` line at the end. Best for piping and streaming:

```bash
max search linear-1 LinearIssue --limit 2 -o ndjson
```

```
{"_id":"001b...","identifier":"ATL-811","title":"...","state":"Done"}
{"_id":"004b...","identifier":"MET-3898","title":"...","state":"Done"}
{"_meta":{"type":"LinearIssue","hasMore":true,"cursor":"ein:LinearIssue:00482baa-..."}}
```

Each line is a complete JSON object, so tools like `jq`, `wc`, and `grep` work line-by-line without buffering.

## When to use each format

| Format | Best for | Parseable | Streamable |
|--------|----------|-----------|------------|
| `text` | Exploration, quick checks | No | No |
| `json` | Scripts, programmatic use | Yes | No (buffered) |
| `ndjson` | Piping, large datasets, streaming | Yes | Yes |

## Pagination

Max uses cursor-based pagination. When there are more results than your limit, the output includes a cursor for the next page.

### Manual pagination

Request pages one at a time with `--limit` and `--after`:

```bash
# First page
max search linear-1 LinearIssue --limit 100

# The output shows: Next page: --after ein:LinearIssue:abc123...
# Use that cursor for the next page:
max search linear-1 LinearIssue --limit 100 --after "ein:LinearIssue:abc123..."
```

Cursors are opaque strings. Don't parse or modify them - just pass them back to `--after`.

### Auto-pagination

Use `--all` to fetch everything automatically:

```bash
max search linear-1 LinearIssue --all -o ndjson
```

This streams all pages in sequence. Each page is fetched and printed as it arrives. There's no practical limit - data is local, so even large result sets are fast.

You can combine `--all` with `--limit` to control the page size:

```bash
# Fetch all results, 50 at a time
max search linear-1 LinearIssue --all --limit 50 -o ndjson
```

## Composing with shell tools

NDJSON output works naturally with standard Unix tools:

```bash
# Count results
max search linear-1 LinearIssue --all -f 'state=Todo' -o ndjson | grep -v _meta | wc -l

# Extract specific fields with jq
max search linear-1 LinearIssue --limit 10 -o json | jq '.data[].title'

# Export to CSV
max search linear-1 LinearIssue --all -o json \
  | jq -r '.data[] | [.identifier, .title, .state] | @csv'

# Sort by a field
max search linear-1 LinearIssue --all -o json | jq '.data | sort_by(.identifier)'
```

For large datasets, prefer `ndjson` over `json` since it streams line-by-line and doesn't need to buffer the full result set.

## What's next

- [Querying Data](/guide/querying-data/) - filters, field selection, and search patterns
- [Field Selection](/guide/field-selection/) - controlling which columns appear

# Max CLI - Agent Usage Guide

Max is a data pipe CLI that syncs and queries data from various sources via connectors.

Example connectors that come pre-bundled include:
- @max/connector-linear
- @max/connector-github
- @max/connector-claude-code-conversations

but connectors are unfettered in what data they may target or provide.

## How Max Works

Max mirrors data locally from external sources. Data is fetched once and stored in a local SQLite database. All queries run against this local copy. All data from connectors is _schematic_.

**This means:**
- Queries are fast and free - no API calls, no rate limits
- Large result sets are fine - request 5,000 or 50,000 results without worry
- You can iterate and explore without cost concerns
- You can inspect the schema of all possible data shapes from your connectors

## Concepts

Max organizes data in a hierarchy:

```
Global (@)
└── Workspace (e.g. "my-project")
    └── Installation (e.g. "linear-1", "github-prod")
        └── Entity (e.g. LinearIssue, GitHubUser)
```

- A **workspace** is a project directory containing a `.max/` folder (created by `max init`)
- An **installation** is a connected data source within a workspace (e.g. a Linear workspace, a GitHub org)
- Each installation has **entity types** with their own schema (e.g. `LinearIssue`, `LinearUser`, `GitHubRepository`)

## Getting Oriented

### 1. Find where you are

Max resolves your context from the current directory, like npm. Run `max status` to see where you are:

```bash
# From within a workspace directory:
max status
# Shows: workspace name, installations, health

# Explicitly target a workspace:
max -t my-project status

# See the global view (all workspaces):
max -g status
```

### 2. See what's available

```bash
# List what's at your current level
max ls

# List installations in a workspace
max -t my-project ls

# List all workspaces (global)
max -g ls
```

Note: `max ls` shows whatever is at your current context level. If you're inside a workspace, it lists installations. Use `max -g ls` to reliably list workspaces.

### 3. Discover entity types and schemas

Use `schema` with a connector source name to see available entity types and their fields:

```bash
max -t my-project schema @max/connector-linear
```

To find an installation's connector, check its status:

```bash
max -t my-project/linear-2 status
# Shows connector name (e.g. @max/connector-linear), full max-url, health
```

### 4. Browse a few records

```bash
# See some issues (default table view)
max -t my-project search linear-1 LinearIssue --limit 5
```

This shows a human-readable table with all fields. Use it to understand the data shape before writing more targeted queries.

## Searching

The `search` command is the primary way to query data. There are two equivalent ways to invoke it:

```bash
# Option 1: Target the workspace, pass installation as an argument
max -t <workspace> search <installation> <EntityType> [options]

# Option 2: Target the installation directly
max -t <workspace>/<installation> search <EntityType> [options]
```

Both are equivalent. Use whichever is more convenient.

### Options

| Flag | Description |
|------|-------------|
| `--limit <n>` | Max results per page (use large numbers freely) |
| `--all` | Return all results with no limit (*release imminent — may not be available yet; if unavailable, use a very large `--limit` instead*) |
| `-f, --filter <expr>` | Filter expression |
| `--fields <list>` | Comma-separated fields to include |
| `--after <cursor>` | Cursor for next page (from previous result) |
| `--order-by <field[:dir]>` | Sort by field, optionally `:asc` or `:desc` |
| `-o, --output <format>` | Output format: `text` (default), `json`, `ndjson` |

### Output formats

**`text`** (default) - Human-readable table. Good for exploration:
```bash
max -t wp search inst LinearIssue --limit 3
```
```
LinearIssue: 3 results, more available

  _id        identifier  title                        state
  001b2c..   ATL-811     Validate TinyBird POC        Done
  00482b..   MET-3898    Delete redshift cluster 1    Done
  005610..   FEA-98      Feature Improvement: FP...   Canceled

Next page: --after ein:LinearIssue:005610bf-bb79-469e-937e-52ede288d413
```

**`json`** - Structured JSON object. Best for programmatic use:
```bash
max -t wp search inst LinearIssue --limit 2 -o json
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

**`ndjson`** - One JSON object per line, with a `_meta` line at the end. Good for piping:
```bash
max -t wp search inst LinearIssue --limit 2 -o ndjson
```
```
{"_id":"001b...","identifier":"ATL-811","title":"...","state":"Done"}
{"_id":"004b...","identifier":"MET-3898","title":"...","state":"Done"}
{"_meta":{"type":"LinearIssue","hasMore":true,"cursor":"ein:LinearIssue:00482baa-..."}}
```

### Field selection

Use `--fields` to control which fields appear:

```bash
# Specific fields
--fields "title,state,assignee"

# Special selectors
--fields ".props"     # All schema properties (no meta fields)
--fields ".meta"      # Only meta fields (_id, _ref)
--fields ".all"       # Everything

# Combine freely — mix named fields with selectors
--fields "name,email,.meta"
```

Fields not present on an entity are simply omitted from its output (no nulls).

### Filtering

Use `-f` / `--filter` for boolean filter expressions.

**Operators:**

| Operator | Meaning |
|----------|---------|
| `=` | Equals |
| `!=` | Not equals |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `~=` | Pattern match (substring/regex) |

**Combinators:** `AND`, `OR`, parentheses for grouping.

**Examples:**
```bash
# Exact match
--filter 'state=Done'

# Comparison
--filter 'priority > 2'

# Pattern match (contains)
--filter 'title~="Zendesk"'

# Compound
--filter 'state=Done AND priority > 2'

# Grouped
--filter '(state=Todo OR state="In Progress") AND priority >= 3'
```

**Important:** Quote the filter string to prevent shell interpretation. Use inner quotes for values with spaces: `--filter 'state="In Progress"'`

### Pagination

Max uses cursor-based pagination. When results are truncated:
- The `text` output shows: `Next page: --after ein:EntityType:uuid`
- The `json` output includes: `"hasMore": true, "cursor": "ein:EntityType:uuid"`
- The `ndjson` output includes a `_meta` line with the cursor

To get the next page, pass the cursor to `--after`:

```bash
max -t wp search inst LinearIssue --limit 100 --after "ein:LinearIssue:2c0f3edc-..."
```

**Tip:** Use `--all` to fetch everything without a limit. If `--all` is not yet available in your version, use a very large `--limit` (e.g. `--limit 50000`) as a fallback — there's no hard cap.

### Ordering

```bash
--order-by priority          # Ascending (default)
--order-by priority:desc     # Descending
--order-by identifier:asc    # Explicit ascending
```

## IDs and Refs

Entities have two identity fields:

- **`_id`** — The installation-native ID. This is typically what the upstream tool uses (e.g. a Linear issue UUID, a GitHub user ID). Use this for filtering and lookups within an installation.
- **`_ref`** — An opaque reference that uniquely identifies an entity across the federation graph. Refs get transformed as they traverse federation layers, so **treat them as opaque** — don't parse or introspect them.

When an entity field references another entity (e.g. an issue's `assignee`), the value is a ref string. To resolve it, look up the referenced entity by `_id`. For example, if you see `assignee` containing a ref to a LinearUser, fetch all LinearUser entities and build a lookup map by `_id` to join them.

## Targeting (`-t`)

Every Max command runs against a target context. If you don't provide `-t`, the target is derived from your current directory — like how npm finds the nearest `package.json`.

A full Max URL has the form: `max://<host>/<workspace>/<installation>`

- `@` means "this machine" and can be omitted as shorthand
- So `max://@/my-project/linear-2` and `my-project/linear-2` are equivalent (when `@` is your only host)

**Relative resolution:** `-t` values are resolved relative to your current context:

```bash
# If you're inside the my-project workspace directory:
max search linear-1 LinearIssue          # implicit: -t is derived from cwd
max -t linear-1 search LinearIssue       # relative: resolves to my-project/linear-1

# Explicit workspace targeting (from anywhere):
max -t my-project ls                     # target workspace → list installations
max -t my-project search linear-1 Issue  # target workspace → workspace-level search
max -t my-project/linear-1 search Issue  # target installation → installation-level search

# Fully qualified:
max -t max://@/my-project/linear-1 search LinearIssue
```

**Global targeting:** Use `-g` (shorthand for `-t max://@`) to target the global level:

```bash
max -g ls        # Always lists workspaces, regardless of cwd
max -g status    # Global health overview
```

**See where you are:** Run `max status` with no arguments to see your current context — it shows your resolved target, available children, and health.

## Thinking in Max

Unlike direct API calls where you'd minimize requests, with Max you should:

1. **Explore first:** Run broad queries with small limits to understand the data shape, field names, and entity relationships
2. **Go big on limits:** Data is local. `--limit 10000` costs nothing. Use `--all` if available, or a very large `--limit` as a fallback
3. **Use `--fields` for token efficiency:** Only fetch fields you need when processing large result sets
4. **Iterate freely:** Run exploratory queries, refine filters, try different approaches — it's all instant
5. **Script for analysis:** For aggregations or cross-entity joins, pipe `json`/`ndjson` output to scripts

### Workflow for answering questions about data

```
1. max status / max -t wp status             → see where you are
2. max -t wp ls                              → see what installations exist
3. max -t wp/inst status                     → see connector name
4. max -t wp schema @max/connector-xyz       → see entity types and fields
5. max -t wp/inst search Entity --limit 5    → browse sample data
6. Formulate query with --filter, --fields, --limit (or --all)
7. If > 1 entity type needed, query each and join in a script
```

### Cross-entity analysis example

To find the most active user per team from Linear issues:

```bash
# Step 1: Get all issues with assignee info
max -t wp/inst search LinearIssue --all --fields "_id,identifier,assignee" -o json > /tmp/issues.json

# Step 2: Get all users (for name resolution)
max -t wp/inst search LinearUser --all --fields "_id,name,displayName" -o json > /tmp/users.json

# Step 3: Get teams
max -t wp/inst search LinearTeam --all --fields "_id,name,key" -o json > /tmp/teams.json

# Step 4: Join and analyze in a script
python3 -c "
import json
from collections import defaultdict
issues = json.load(open('/tmp/issues.json'))['data']
users = {u['_id']: u.get('displayName') or u.get('name') for u in json.load(open('/tmp/users.json'))['data']}
# ... aggregate and report
"
```

## Other Commands

### `schema`

View the entity schema for a connector:

```bash
max -t <workspace> schema <connector-source>
```

Note: `schema` takes a connector package name (e.g. `@max/connector-linear`, `@max/connector-github`), not an installation name. Find the connector name for an installation via `max -t <workspace>/<installation> status`.

### `sync`

Refresh data from a connected source:

```bash
max -t <workspace> sync <installation>
```

**WARNING: Do NOT run `sync` unless explicitly authorized by the user.** Syncs hit upstream APIs and can be expensive (API quota, rate limits, time).

### `connect`

Connect a new data source:

```bash
max -t <workspace> connect <source> [-n <name>]
```

**Note:** This command typically requires interactive user input (credentials, OAuth flows). It's usually better to ask the user to run it themselves rather than running it autonomously.

### `status`

Check health at any level:

```bash
max status                     # Global
max -t <workspace> status      # Workspace
```

## Tips

1. **Use `schema` to discover entity types:** `max -t wp schema @max/connector-xyz` shows entity types and fields. Find the connector name via `max -t wp/inst status`
2. **Use `--fields` to reduce noise:** Especially useful when you need specific columns from wide entities. Combine named fields with selectors: `--fields "name,email,.meta"`
3. **Don't be shy with `--limit`:** Data is local. 10,000 rows is fine. Use `--all` when available
4. **Use `_id` to join entities:** When a field references another entity, look up the target entity by `_id`. Don't try to parse ref strings — they're opaque
5. **Use `json` for scripting:** `-o json` gives you a clean structure with `data` array and `hasMore`/`cursor` for pagination
6. **Filter fields must exist:** Use `schema` to see valid field names, or expect a helpful error message listing them
7. **Multiple installations can share entities:** The same user might appear in `linear-1` and `linear-2` with different data completeness — check both if one is sparse
8. **Never `sync` without permission:** Syncs hit upstream APIs and can be expensive. Always ask the user first
9. **Let the user run `connect`:** It requires interactive input (credentials, OAuth). Suggest it rather than running it

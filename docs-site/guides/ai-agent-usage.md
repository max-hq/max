# AI Agent Usage

Max is designed for AI agents to consume data efficiently via the CLI. This page covers how to set up an agent to work with Max.

## Bootstrap your agent

Run `max llm-bootstrap` to generate a context block that teaches your agent about Max:

```bash
max llm-bootstrap > SKILL.md
```

Your agent now knows how to discover connectors, run queries, and work with Max's output formats.

## Key concepts for agents

### Workspaces and installations

- A **workspace** is a directory with `.max/` — scoped data store
- An **installation** is a connected data source within a workspace (e.g. `linear-1`, `hubspot-1`)
- Use `max ls` to discover installations, `max schema <name>` to discover entity types and fields

### Searching

Agents should use `max search` with filters and field selectors:

```bash
# Find tasks matching a keyword
max search linear-1 LinearIssue --filter 'title ~= "auth"' --fields title,status

# Get all users as ndjson (machine-readable)
max search hubspot-1 HubspotContact --all --output ndjson

# Count records
max count linear-1 LinearIssue
```

### Output formats

- **table** (default) — human-readable, truncated columns
- **ndjson** — one JSON object per line, great for piping to `jq`
- **json** — full JSON array

### Piping and composition

Because Max is a CLI, agents can use standard Unix tools:

```bash
# Count matching records
max search linear-1 LinearIssue --all --output ndjson | wc -l

# Extract specific fields with jq
max search linear-1 LinearIssue --all --output ndjson | jq '.title'

# Chain with other tools
max search hubspot-1 HubspotContact --all --output ndjson \
  | jq -r '.email' \
  | sort | uniq -c | sort -rn | head -20
```

This is the fundamental advantage over MCP — the agent can process data *before* it enters the context window, keeping token usage minimal.

## Field selectors

```bash
--fields name,email          # Specific fields
--fields .props              # All user-defined fields
--fields .meta               # Meta fields (_id, _ref, etc.)
--fields .all                # Everything
```

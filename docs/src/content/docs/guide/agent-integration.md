---
title: Agent Integration
sidebar:
  order: 5
---

Max is designed so AI agents have fast, unfettered access to your data. Agents interact with Max the same way you do - through CLI commands. The difference is that Max gives them a structured bootstrap document so they know what's available and how to use it.

## Giving your agent access

Run `max llm-bootstrap` to generate a document that teaches an agent how to use Max:

```bash
max -g llm-bootstrap
```

This outputs a markdown guide covering:

- How Max works (local data, no API calls, no rate limits)
- The workspace/installation/entity hierarchy
- How to orient (status, ls, schema)
- Full search syntax (filters, fields, output formats, pagination)
- Targeting with `-t`
- Workflow patterns for answering questions

Hand this output to your agent as context. For example, with Claude:

```
Hey Claude - run `max -g llm-bootstrap` and read the output.
Use it to answer questions about my data.
```

Or pipe it directly:

```bash
max -g llm-bootstrap > agent-context.md
```

## What agents can do

With the bootstrap context, an agent can:

- **Explore** - run `max status`, `max ls`, and `max schema` to understand what data exists
- **Query** - run `max search` with filters, field selection, and output formatting
- **Sync** - run `max sync` to refresh data (though agents should ask permission first - syncs hit upstream APIs)
- **Compose** - pipe JSON/NDJSON output into scripts for cross-entity analysis

Agents don't need special APIs or SDKs. Everything happens through the same CLI you use.

## Example workflows

### Finding information

An agent asked "what open bugs are assigned to the platform team?" might:

```bash
# 1. Orient - what installations exist?
max ls

# 2. Discover schema
max schema @max/connector-linear

# 3. Search for open bugs
max search linear-1 LinearIssue \
  --all \
  -f 'state=Todo AND labels~="bug"' \
  --fields="identifier,title,assignee" \
  -o json
```

### Cross-entity analysis

For questions that span entity types, agents can query each type and join the results:

```bash
# Get issues
max search linear-1 LinearIssue --all --fields="_id,title,assignee" -o ndjson > /tmp/issues.ndjson

# Get users (for name resolution)
max search linear-1 LinearUser --all --fields="_id,displayName" -o ndjson > /tmp/users.ndjson

# Join and analyse
python3 -c "
import json
issues = [json.loads(l) for l in open('/tmp/issues.ndjson')]
users = {u['_id']: u['displayName'] for u in (json.loads(l) for l in open('/tmp/users.ndjson'))}
for issue in issues:
    name = users.get(issue.get('assignee', ''), 'Unassigned')
    print(f'{name}: {issue[\"title\"]}')
"
```

## Tips for effective agent use

**Encourage exploration first.** Agents should run `max status`, `max ls`, and `max schema` before attempting targeted queries. This prevents guessing at entity type names or field names.

**Use `--fields` for token efficiency.** When an agent processes large result sets, selecting only needed fields reduces output size significantly.

**Use `--all` freely.** Data is local. Agents can request thousands of rows without cost concerns. This is one of Max's key advantages over direct API access.

**Use the right output format.** Use `ndjson` for streaming with `--all` — it emits one JSON object per line, ideal for piping and large result sets. Use `json` for paginated access — it returns a single valid JSON object with `data` array and pagination metadata (`hasMore`, `cursor`). Note: `--all` is not compatible with `-o json`.

**Don't parse `_ref` values.** When entity fields reference other entities (like an issue's assignee), the value is a ref string. Agents should look up the referenced entity by `_id` rather than trying to decode the ref.

## What's next

- [CLI Overview](/cli/overview/) - understand the full command set
- [Querying Data](/guide/querying-data/) - deep dive into search syntax
- [Targeting](/cli/targeting/) - how `-t` works for addressing workspaces and installations

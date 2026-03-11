# Using the CLI

Max exposes all functionality through its CLI. Commands operate in the context of a **workspace** (a directory with a `.max/` folder) or globally with the `-g` flag.

## Workspace commands

```bash
# Initialize a workspace
max init .

# List installations
max ls

# Check status
max status

# View a connector's schema
max schema <installation>
```

## Connecting data sources

```bash
# Connect a connector
max connect @max/connector-acme --name acme-1

# Connect from a collection
max connect @max/connector-linear --name linear-1
```

## Syncing

```bash
# Full sync
max sync <installation>

# Sync specific entity types
max sync <installation> AcmeUser AcmeTask
```

## Searching

```bash
# Basic search
max search <installation> <EntityType>

# With filters
max search <installation> AcmeTask --filter 'title ~= "protocol"'

# Select fields
max search <installation> AcmeUser --fields name,email

# Output as ndjson
max search <installation> AcmeUser --output ndjson

# Stream all results
max search <installation> AcmeUser --all
```

### Filter syntax

| Operator | Meaning |
|----------|---------|
| `=`      | Exact match |
| `~=`     | Contains / wildcard |

## Targeting

Max uses `-t` to target a specific workspace or installation:

```bash
# Target a workspace by path
max -t /path/to/workspace ls

# Target globally
max -g ls
```

If you're inside a workspace directory, Max detects it automatically.

## Installing connector collections

```bash
# Install the official collection
max -g install --collection git@github.com:max-hq/max-connectors

# Install a local collection
max -g install --collection /path/to/local/repo
```

## Teaching your AI agent

```bash
max llm-bootstrap
```

Outputs a context block that teaches an AI agent what Max is and how to use it. Pipe it to a file your agent can read.

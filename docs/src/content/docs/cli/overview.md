---
title: CLI Overview
sidebar:
  order: 1
---

Max organises its commands into three levels based on what you're operating on. Understanding these levels is the key to using the CLI fluently.

## The node hierarchy

Max organises data in a three-level hierarchy. Each level is a **node**, and each node has an address:

```
Global (@)
└── Workspace (e.g. "my-project")
    └── Installation (e.g. "linear-1", "github-prod")
```

Every command runs against a node at one of these levels. Max resolves which node from your current directory, or you can target one explicitly with `-t`. See [Targeting](/cli/targeting/) for the full details.

## Global commands

> `max -g ...` or `max -t max://@  ...`

Available from anywhere. These manage workspaces and global configuration.

| Command | Description |
|---------|-------------|
| `max init <dir>` | Create a new workspace |
| `max install --collection <source>` | Install a connector collection |
| `max -g ls` | List all workspaces |
| `max -g status` | Global health overview |
| `max -g llm-bootstrap` | Generate agent context document |

The `-g` flag forces global context regardless of your current directory.

## Workspace commands

> `max -t <workspace> ...`

Available when you're inside a workspace directory (one initialised with `max init`), or when you target a workspace with `-t`.

| Command | Description |
|---------|-------------|
| `max connect <source>` | Connect a new data source |
| `max ls` | List installations |
| `max status` | Workspace health and installations |
| `max schema <source>` | View entity schema for a connector |
| `max sync <installation>` | Sync an installation |
| `max search <installation> <EntityType>` | Search within an installation |

At the workspace level, commands like `sync` and `search` take an installation name as an argument. You're telling Max "within this workspace, sync that installation."

## Installation commands

> `max -t <workspace>/<installation> ...`

Available when you target a specific installation with `-t`, or when your current directory is inside an installation:

| Command | Description |
|---------|-------------|
| `max search <EntityType>` | Search entities (no installation argument needed) |
| `max sync` | Sync this installation |
| `max status` | Installation health and connector info |
| `max schema` | View entity schema |

At the installation level, you don't need to pass the installation name - it's already resolved from your target.

You can also navigate directly into an installation directory:

```bash
cd my-project/.max/installations/linear-1
max search LinearIssue --limit 5
# Equivalent to: max -t my-project/linear-1 search LinearIssue --limit 5
```

## How context resolution works

Max determines your level by looking at your current directory, similar to how npm finds the nearest `package.json`. See [Targeting - Default resolution](/cli/targeting/#default-resolution) for the full explanation with examples.

You can always override context with `-t` or `-g`.

## Getting help

Every command supports `--help`:

```bash
max --help              # List all available commands
max search --help       # Search command options
max install --help      # Install command options
```

The available commands change based on your context. Running `max --help` inside a workspace shows workspace-level commands; running it outside shows global commands.

## What's next

- [Targeting](/cli/targeting/) - the `-t` flag and how to address specific nodes
- [Daemon Mode](/cli/daemon-mode/) - how the daemon keeps responses fast
- [Output and Pagination](/cli/output-and-pagination/) - controlling result format and size

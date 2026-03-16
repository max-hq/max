---
title: CLI Overview
sidebar:
  order: 1
---

Max organises its commands into three levels based on what you're operating on. Understanding these levels is the key to using the CLI fluently.

## Command levels

Every command runs at one of three levels:

**Global** - operates across your whole machine. No workspace context needed.

**Workspace** - operates within a specific project. Requires being inside a workspace directory (or targeting one with `-t`).

**Installation** - operates on a specific data source within a workspace.

Max resolves your level from context. If you're inside a workspace directory, workspace and installation commands are available. If you're not, only global commands work (unless you target explicitly with `-t`).

## Global commands

Available from anywhere. These manage workspaces and global configuration.

| Command | Description |
|---------|-------------|
| `max init <dir>` | Create a new workspace |
| `max install --collection <source>` | Install a connector collection |
| `max -g ls` | List all workspaces |
| `max -g status` | Global health overview |
| `max -g llm-bootstrap` | Generate agent context document |
| `max daemon` | Manage the background daemon |

The `-g` flag forces global context. See [Targeting](/cli/targeting/) for details.

## Workspace commands

Available when you're inside a workspace directory (one that has been initialised with `max init`).

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

Available when you target a specific installation with `-t`:

```bash
max -t my-project/linear-1 search LinearIssue
max -t my-project/linear-1 sync
max -t my-project/linear-1 status
max -t my-project/linear-1 schema
```

| Command | Description |
|---------|-------------|
| `max search <EntityType>` | Search entities (no installation argument needed) |
| `max sync` | Sync this installation |
| `max status` | Installation health and connector info |
| `max schema` | View entity schema |

At the installation level, you don't need to pass the installation name since it's already resolved from your target.

## How context resolution works

When you run a command, Max determines your level by looking at your current directory:

1. If you're inside `.max/installations/<name>/`, you're at the installation level
2. If you're inside a directory with a `.max/` folder, you're at the workspace level
3. Otherwise, you're at the global level

This is similar to how npm finds the nearest `package.json`. You can always override with `-t` or `-g`.

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
- [Daemon Mode](/cli/daemon-mode/) - direct vs daemon execution
- [Output and Pagination](/cli/output-and-pagination/) - controlling result format and size

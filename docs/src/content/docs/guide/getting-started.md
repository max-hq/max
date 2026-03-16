---
title: Getting Started
sidebar:
  order: 1
---

This guide walks through setting up Max, connecting a data source, and running your first sync.

## Prerequisites

You need Max installed and a connector collection available. If you don't have Max yet, see the project README for installation instructions.

## Create a workspace

A workspace is a project directory where Max stores configuration and data. Run `max init` to create one:

```bash
max init my-project
cd my-project
```

This creates a `my-project/` directory with a `max.json` file and a `.max/` folder for internal state. The `.max/` directory is gitignored by default - it holds credentials and local data that shouldn't be shared.

You can also initialise the current directory:

```bash
mkdir my-project && cd my-project
max init .
```

## Install connectors

Connectors teach Max how to sync from a specific data source. They're distributed as collections - packages that bundle multiple connectors together.

```bash
max install --collection git@github.com:max-hq/max-connectors.git
```

<!-- TODO: verify exact output format of max install -->

This clones the collection to `~/.max/collections/` and makes its connectors available to all your workspaces. If the collection is already installed, it pulls the latest version.

For local development, you can link a directory instead of cloning:

```bash
max install --collection /path/to/local/connectors
```

This creates a symlink, so changes to the local directory are picked up immediately.

## Connect a source

With connectors installed, connect a data source. This creates an installation - a configured instance of a connector within your workspace.

```bash
max connect @max/connector-linear
```

<!-- TODO: verify exact onboarding flow - what prompts appear? -->

The connect command runs an interactive onboarding flow. Depending on the connector, you might be asked for:

- API tokens or OAuth credentials
- Workspace or organisation selection
- Configuration options specific to that data source

Credentials are stored securely in `.max/installations/<name>/credentials.json`, never in `max.json`.

You can name your installation explicitly:

```bash
max connect @max/connector-linear --name linear-prod
```

If you don't provide a name, Max generates one (like `linear-1`).

## Sync

With a source connected, sync it to pull data into local storage:

```bash
max sync linear-1
```

```
Syncing...
    LinearTeam       █████      12  1021.8 op/s
    LinearUser       █████     283  4391.1 op/s
    LinearIssue      ███▒·    2156  4811.3 op/s
    ──────────────────────────────────────────────
    3.2s elapsed
```

The sync fetches data from the source API and stores it locally. Once synced, all queries run against this local copy - no API calls, no rate limits, millisecond latency.

## Check status

See what's in your workspace:

```bash
max ls
```

This lists all installations in the current workspace. To see more detail:

```bash
max status
```

Status shows your workspace name, installations, their health, and connector information.

To see everything across all workspaces:

```bash
max -g ls
max -g status
```

The `-g` flag targets the global level. See [Targeting](/cli/targeting/) for more on how Max resolves what you're operating on.

## Browse your data

Take a quick look at what was synced:

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

To see what entity types and fields are available:

```bash
max schema @max/connector-linear
```

<!-- TODO: verify max schema output format -->

## What's next

- [Querying Data](/guide/querying-data/) - filters, field selection, output formats, and piping
- [CLI Overview](/cli/overview/) - understand the command hierarchy and how Max organises commands
- [Targeting](/cli/targeting/) - how to address specific workspaces and installations

---
title: Installing Connectors
sidebar:
  order: 5
---

Connectors teach Max how to sync from a specific data source. They're distributed as collections - packages that bundle multiple connectors together.

## Installing a collection

```bash
max install --collection git@github.com:max-hq/max-connectors.git
```

<!-- TODO: verify exact output format -->

This clones the collection repository to `~/.max/collections/<name>/` and makes its connectors available across all your workspaces. The collection name is derived from the repository name (e.g., `max-connectors`).

If the collection is already installed, Max pulls the latest version instead of cloning again.

## What gets installed

A collection is a directory (or repository) containing one or more `connector-*` subdirectories. Each subdirectory is a connector package. After installation, Max discovers these connectors and makes them available to `max connect`.

Collections are stored globally at `~/.max/collections/`:

```
~/.max/collections/
└── max-connectors/
    ├── connector-linear/
    ├── connector-github/
    ├── connector-google-drive/
    └── ...
```

## Discovering connectors

<!-- TODO: there is no dedicated CLI command to list available connectors yet. This section should be updated when one is added. -->

There is currently no command to list all available connectors. You can inspect the collection directory directly:

```bash
ls ~/.max/collections/max-connectors/
# connector-linear/  connector-github/  connector-google-drive/  ...
```

To see what entity types a connector provides before connecting it:

```bash
max schema @max/connector-linear
```

## Updating

Re-run the install command to pull the latest version of a collection:

```bash
max install --collection git@github.com:max-hq/max-connectors.git
```

If the collection was previously cloned, this runs `git pull` to update it.

## Local development

When developing connectors locally, you can link a directory instead of cloning:

```bash
max install --collection /path/to/local/connectors
```

This creates a symlink from `~/.max/collections/<name>/` to your local directory. Changes to the local directory are picked up immediately - no need to reinstall.

If a clone of the same collection already exists, the symlink replaces it.

## What's next

- [Getting Started](/guide/getting-started/) - connect a source and run your first sync
- [CLI Overview](/cli/overview/) - the full command hierarchy

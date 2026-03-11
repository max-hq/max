# Architecture

Max is structured as a monorepo of platform-agnostic core packages with pluggable runtime bindings.

## Package layers

```
┌─────────────────────────────────────────────────┐
│  @max/cli            Presentation layer         │
├─────────────────────────────────────────────────┤
│  @max/federation     Core federation logic       │
│  @max/execution      Task/sync orchestration     │
├─────────────────────────────────────────────────┤
│  @max/connector      Connector SDK               │
│  @max/core           Types, utilities, Engine    │
├─────────────────────────────────────────────────┤
│  @max/platform-bun        Runtime bindings       │
│  @max/storage-sqlite      Storage implementation │
│  @max/execution-sqlite    Execution backend      │
└─────────────────────────────────────────────────┘
```

Dependencies flow **downward**. `@max/core` has zero internal dependencies. The CLI depends on everything; nothing depends on the CLI.

## Data flow

The sync pipeline moves data from upstream APIs into local storage:

```
SyncPlan → Resolvers → Loaders → Engine → Storage
```

1. **SyncPlan** — declares what to sync (which entities, which fields)
2. **Resolvers** — map entity fields to loaders
3. **Loaders** — fetch data from upstream APIs (batched, paginated)
4. **Engine** — the storage abstraction layer
5. **Storage** — concrete implementation (SQLite)

## Federation model

Max uses a three-tier hierarchy:

Global
: The root of the Max universe. Manages workspaces and global configuration.

Workspace
: A project directory with a `.max/` folder. Contains installations.

Installation
: A single connected data source (e.g. "my-linear", "team-hubspot"). Owns synced entities.

## Platform agnosticism

The core packages (`@max/core`, `@max/connector`, `@max/federation`, `@max/execution`) contain no I/O and no platform dependencies. All runtime specifics are pushed into platform bindings:

- `@max/platform-bun` — Bun runtime, filesystem, process management
- `@max/storage-sqlite` — SQLite via `bun:sqlite`
- `@max/execution-sqlite` — SQLite-backed task store

This means the core logic can be ported to other runtimes (Node, Deno, Cloudflare Workers) by implementing the platform interfaces.

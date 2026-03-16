---
title: Module Boundaries
sidebar:
  order: 2
---

How Max's packages relate to each other, what each one owns, and where new code should go.

## Package Overview

```
@max/core              Types and foundations. No I/O, no services.
    ^
@max/connector         Connector SDK. What connector authors import.
@max/execution         Sync orchestration interfaces.
    ^
@max/federation        Business logic. Orchestration, registries, protocols.
    ^
@max/platform-bun      Bun-specific implementations. FS, SQLite, daemon.
    ^
@max/cli               Presentation + daemon hosting. Owns all terminal I/O.
```

Each layer depends only on layers below it. Nothing depends on `@max/cli`.

---

## `@max/core`

The vocabulary of Max. Entity types, Ref, Schema, Fields, brands, Engine (the data access interface), Loader/Resolver/Seeder contracts, and foundational utilities like `StaticTypeCompanion`, `makeLazy`, and `MaxError`.

No services, no I/O, no file system access. Pure types and data structures.

## `@max/connector`

The connector SDK. Contains `ConnectorDef`, `ConnectorModule`, `Installation`, `OnboardingFlow`, `Credential`, and `ConnectorRegistry`. This is what connector authors use to define integrations.

`OnboardingFlow` describes *what* to collect from a user during setup (fields, credentials, validation steps, selections). It never describes *how* to render those steps - that's a platform concern.

## `@max/execution`

Abstract sync orchestration interfaces: `TaskStore`, `TaskRunner`, `SyncHandle`, `SyncExecutor`, `SyncQueryEngine`, `SyncObserver`. Defines *what* sync execution looks like without choosing *how*.

Two implementation packages sit alongside it:

- **`@max/execution-local`** - In-process implementations (`InMemoryTaskStore`, `DefaultTaskRunner`, `LocalSyncQueryEngine`)
- **`@max/execution-sqlite`** - SQLite-backed implementations (`SqliteTaskStore`, `SqliteSyncMeta`, `SqliteSyncQueryEngine`)

## `@max/federation`

The orchestration and business logic layer. Defines three federated scopes:

**`GlobalMax`** - operations that don't require a workspace:
- Workspace provisioning
- Collection management
- Global configuration

**`WorkspaceMax`** - operations scoped to a workspace (a `.max/` directory):
- Installation provisioning and registry
- Connector management
- Schema inspection

**`InstallationMax`** - operations scoped to a single connector installation:
- Sync orchestration
- Data querying
- Health checks

Each scope has typed registries, clients, and protocols. Parent scopes provision children - a workspace provisions installations, global provisions workspaces.

### Structured Data Only

Everything in `@max/federation` returns structured data. No formatted strings, no ANSI codes, no terminal assumptions. A `Schema` object, not a pretty-printed schema string. This is the reuse boundary.

### RPC-Ready

Federation defines protocols for remote communication between scopes. An installation can run in-process, in a daemon, or in a container - the client interface is the same.

## `@max/platform-bun`

Bun-specific implementations of federation's abstract interfaces:

- **Filesystem services** - `FsWorkspaceRegistry`, `FsInstallationRegistry`, `FsInstallationProvisioner`, `FsWorkspaceProvisioner`, `FsCredentialStore`
- **Storage** - Wires up `SqliteEngine`, `SqliteTaskStore`, `SqliteSyncMeta`
- **Deployers** - `InProcessDeployer`, `DaemonDeployer`, `DockerDeployer`, `RemoteDeployer`
- **Connector registry** - `NaiveBunConnectorRegistry` (scans collections, lazy-loads modules)
- **RPC transport** - `BunDaemonTransport`, `RpcSocketServer`
- **Config** - `GlobalConfig`, `ProjectConfig`
- **DI** - Three `ResolverGraph` instances (global, workspace, installation) for typed dependency injection

`@max/platform-bun` is the composition root - it wires abstract interfaces to concrete implementations.

## `@max/cli`

The terminal presentation layer. Everything that touches the user's terminal:

- **Argv parsing** - Optique parsers, help text, shell completions
- **Output formatting** - ANSI colours, tables, `--json` flags
- **Interactive I/O** - readline, prompts, onboarding step rendering
- **Daemon hosting** - socket server, PID management, process lifecycle

### Daemon is a Deployment Mode

The daemon is not a separate domain. It's the federation layer hosted in a persistent process, reachable over a Unix socket. The CLI has two execution modes:

1. **Direct:** construct platform -> run operation -> format output -> exit
2. **Daemon:** construct platform -> keep alive -> accept socket requests -> run operation -> format output -> respond

The federation layer is identical in both modes. The socket protocol and process lifecycle are purely CLI concerns.

### Formatting is a CLI Concern

Structured data from `@max/federation` is formatted by CLI-side printer functions. No formatting logic in the federation layer. If a DTO doesn't expose enough data for the formatter, the fix is to enrich the DTO's public surface, not to move formatting upstream.

### Onboarding Rendering

`OnboardingFlow` (defined in `@max/connector`) describes steps declaratively. The CLI interprets those steps as terminal prompts: readline for input steps, numbered menus for select steps, spinners for validation steps. A web layer would interpret the same steps as form wizards. The flow definition is shared; the rendering is platform-specific.

## Supporting Packages

| Package | Role |
|---------|------|
| `@max/storage-sqlite` | `SqliteEngine` - the SQLite implementation of the Engine interface |
| `@max/query-parser` | Parses query strings into ASTs |
| `@max/plan-parser` | Parses sync plan expressions |

---

## Where New Code Goes

| I'm adding... | Package |
|---|---|
| A new entity type, brand, or data structure | `@max/core` |
| A new connector | A connector collection, using `@max/connector` |
| A field type, loader variant, or sync primitive | `@max/core` |
| A new business operation or registry | `@max/federation` |
| A Bun-specific service implementation | `@max/platform-bun` |
| A new CLI command | `@max/cli` (parser + routing + formatter) |
| Output formatting or display logic | `@max/cli` |
| A new onboarding step type | `@max/connector` (step definition) + `@max/cli` (step renderer) |
| A new deployer (Docker, remote, etc.) | `@max/platform-bun` |

## Replication Boundary

If a second platform (web UI, REST API) were added, it would implement `@max/federation`'s abstract interfaces (like `@max/platform-bun` does) and replace `@max/cli` entirely. The shared kernel is everything at and below the federation layer. The replicated surface is platform implementations, input parsing, output formatting, and interactive flow rendering.

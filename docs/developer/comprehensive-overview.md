# Max Architecture Overview

Quick-reference overview of the Max codebase. Intended as an orientation document for agents and developers entering the codebase for the first time.

**Last regenerated:** March 2026.

---

## What Max Is

A federated data query layer that syncs external SaaS data (Linear, GitHub, Google Drive, etc.) into local SQLite via typed connectors. Bun runtime, TypeScript, monorepo.

---

## Package Layers

Bottom-up dependency order. Each layer imports only from layers below it.

```
@max/core                Types, schematic types, Engine interface. No I/O.
    ^
@max/connector           Connector SDK (ConnectorDef, ConnectorModule, OnboardingFlow)
@max/execution           Sync orchestration interfaces (TaskStore, SyncExecutor)
    ^
@max/execution-local     In-memory implementations (InMemoryTaskStore, DefaultTaskRunner)
@max/execution-sqlite    SQLite implementations (SqliteTaskStore, SqliteSyncMeta)
@max/storage-sqlite      SQLite Engine implementation (bun:sqlite)
    ^
@max/federation          Business logic. Three-tier federation, registries, RPC protocols.
    ^
@max/platform-bun        Bun-specific: FS services, deployers, DI wiring, connector registry.
    ^
@max/cli                 Terminal presentation, argv parsing, daemon hosting.
```

Supporting: `@max/query-parser` (query ASTs), `@max/plan-parser` (sync plan expressions).

---

## Core Type System

- **EntityDef** - Named entity with typed fields (Field.string, Field.ref, Field.collection, etc.)
- **Ref\<E, S\>** - Type-safe reference to an entity. Polymorphic over Scope (local vs system)
- **EntityInput** - Data payload for storing an entity (ref + field values)
- **EntityResult** - Proxy-based typed result from loading an entity
- **Schema** - Collection of EntityDefs with designated roots
- **Scope** - LocalScope (within one installation) vs SystemScope (cross-installation)
- **Branded types** - SoftBrand (naked assignment OK) for IDs; HardBrand (factory required) for validated values
- **Type + Companion Object** - Single name serves as both TypeScript type and value namespace. Used for schematic types only (EntityDef, Ref, Page, etc.), never services

---

## Connector Model

A connector is a self-contained package that teaches Max how to sync from one external system.

- **ConnectorDef** - Pure data descriptor: name, schema, resolvers[], seeder, onboarding flow
- **ConnectorModule** - Pairs ConnectorDef with `initialise(config, credentials) -> Installation`
- **Installation** - Live runtime instance. Holds hydrated Context (API clients, tokens, workspace IDs)
- **Onboarding** - Step pipeline (InputStep, ValidationStep, SelectStep, CustomStep) that collects config + credentials before first sync
- **Credentials** - CredentialStore (get/set/has/delete key-value) -> CredentialProvider (connector-facing, typed handles)

### What a connector author provides

- **Entities** - EntityDef declarations with fields
- **Schema** - `Schema.create({ namespace, entities, roots })`
- **Context** - Class extending Context base. Holds API client instances, workspace IDs, etc.
- **Resolvers** - One per entity. Maps every field to a Loader
- **Loaders** - Data fetchers:
  - `Loader.entity()` - single entity by ref
  - `Loader.entityBatched()` - batch fetch (preferred when API supports it)
  - `Loader.collection()` - paginated parent -> child relationship
  - `Loader.paginatedSource()` / `Loader.singleSource()` + `Loader.deriveEntities()` - Source + Derivation pattern for efficient multi-entity extraction
- **Seeder** - Produces initial SyncPlan from context + engine state
- **Onboarding** - Step-by-step flow for user setup

See [Creating a Connector](./creating-an-integration.md) for the full guide.

---

## Sync Pipeline

Declarative plan -> task graph -> drain loop.

1. **Seeder.seed(context, engine)** -> SyncPlan (pure data)
2. **SyncPlan** - Ordered list of Steps. Each Step = target + operation
   - Targets: `forRoot(ref)`, `forAll(EntityDef)`, `forOne(ref)`
   - Operations: `loadFields("f1", "f2")`, `loadCollection("children")`
   - `Step.concurrent([...])` for parallel groups
3. **PlanExpander** converts steps into a task graph with dependency edges
4. **TaskStore** persists tasks with state and dependencies
5. **SyncExecutor** runs the drain loop: claim -> execute -> complete -> unblock dependents
6. **TaskRunner** dispatches to the correct Loader, calls engine.store()
7. **SyncHandle** returned immediately - exposes status, pause/resume/cancel, completion()

See [Synchronisation Layer](./synchronisation-layer.md) for the full walkthrough.

---

## Federation - Three-Tier Architecture

Max uses a three-level federation model. Each level has typed registries, clients, and lifecycle management.

**GlobalMax** - top-level entry point. Manages workspaces.
- List/create workspaces
- Connector registry (discovers available connectors)
- Health checks

**WorkspaceMax** - scoped to a `.max/` project directory. Manages installations.
- List/create installations
- Schema inspection across connectors
- Connector onboarding
- Installation deduplication by natural key (connector + name)

**InstallationMax** - scoped to a single connector installation.
- Sync execution
- Data querying (via Engine)
- Health checks

Parent scopes provision children. A workspace provisions installations; global provisions workspaces.

---

## Deployers

Installations can run in different process topologies. The deployer abstraction decouples "where code runs" from "what code does":

| Deployer | Process model | Communication |
|----------|--------------|---------------|
| InProcess | Same Bun process | Direct function calls |
| Daemon | Child OS process | Unix socket (JSONL) |
| Remote | External HTTP endpoint | HTTP transport |
| Docker | Container (planned) | Not yet implemented |

---

## Process Architecture

```
User
  |
Rust proxy (max binary)
  |
  +-- Direct mode: spawns Bun inline, runs command, exits
  |
  +-- Daemon mode: connects to running daemon via Unix socket
        |
      Bun process (one per workspace)
        +-- GlobalMax
              +-- WorkspaceMax (one per project)
                    +-- InstallationMax (one per connector installation)
                          +-- Engine (SQLite)
                          +-- SyncExecutor
```

The Rust proxy handles terminal I/O (including secret prompts with echo suppression), color detection, and JSONL protocol with the daemon. It tries the daemon first, falls back to direct mode.

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `init` | Create a new Max workspace |
| `install` | Install connector collections |
| `connect` | Set up a connector installation (runs onboarding) |
| `sync` | Sync data from installed connectors |
| `search` | Search across synced data |
| `schema` | View entity schema for a connector |
| `status` | Show workspace/installation status |
| `ls` | List installations and workspaces |
| `daemon` | Daemon lifecycle management |
| `llm-bootstrap` | Generate LLM agent context |

---

## Filesystem Layout

**Workspace** (project root):
```
project/
+-- max.json                      # Workspace metadata
+-- .max/                         # Secrets & runtime state (gitignored)
    +-- installations/
        +-- {name}/               # One per connector installation
            +-- credentials.json  # Auth tokens/secrets
            +-- data.db           # SQLite database (entities + tasks)
```

**Global** (`~/.max/`):
```
~/.max/
+-- collections/                  # Installed connector collections
    +-- max-connectors/           # Symlink or cloned repo
+-- daemons/                      # Per-workspace daemon state
    +-- {workspace-hash}/
        +-- daemon.sock           # Unix socket
        +-- daemon.pid            # PID file
```

---

## Swappable Boundaries

Interfaces are defined in core/execution/federation. Implementations are pluggable.

| Interface | Current implementation | Package |
|-----------|----------------------|---------|
| Engine | SqliteEngine | @max/storage-sqlite |
| TaskStore | SqliteTaskStore / InMemoryTaskStore | @max/execution-sqlite / @max/execution-local |
| SyncMeta | SqliteSyncMeta / InMemorySyncMeta | @max/execution-sqlite / @max/execution-local |
| CredentialStore | FsCredentialStore | @max/platform-bun |
| ConnectorRegistry | NaiveBunConnectorRegistry | @max/platform-bun |
| WorkspaceRegistry | FsWorkspaceRegistry | @max/platform-bun |
| InstallationRegistry | FsInstallationRegistry | @max/platform-bun |

---

## Error System

- **MaxError** - Composable error with facets (typed metadata) and boundaries (domain grouping)
- Pattern: `boundary = MaxError.boundary("domain")` -> `ErrFoo = boundary.define("code", { facets, message })`
- Errors carry structured data via facets, render with `prettyPrint({ color })`

See [Error System](./error-system.md) for the full guide.

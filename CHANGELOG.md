# Changelog

All notable changes to Max will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- HTTP server for serving Max data over HTTP, with remote command execution and completions support (max-mini-http, cli)
- Explorer UI for browsing synced data visually (max-explorer-demo)
- Tab completions for Nushell and PowerShell (cli)
- Astro Starlight documentation site with restructured guides for connectors, SDK, and CLI
- Getting-started documentation
- Support for installing local connector collections via symlink
- Dynamic onboarding flows for connectors with conditional step execution (connector)
- Flow control framework - configurable concurrency and rate limiting for connector operations (execution, core)
- Operations framework - structured indirection for upstream API calls with middleware support (execution)

### Changed
- Core connector packages are now automatically linked on install

### Fixed
- Duplicate workspace names being allowed
- Tab completions showing `@` and `max://` prefixes in contexts where they aren't valid (cli)
- Invalid tab completions in bash shells (cli)
- `max search` without `--limit` or `--all` fetching entire table into memory instead of defaulting to a page size of 1000 (storage-sqlite)
- Daemon mode hanging forever when a connector fails during health check (federation, cli)

## [0.1.0] - 2026-03-11

A summary of development prior to formal changelog tracking.

### Mar 8 – Mar 11, 2026

Polish, performance, and architecture cleanup.

#### Added
- Streaming results for `search --all`

#### Changed
- Bulk writes in engine and task runner for improved sync performance
- Removed deprecated `daemon` command

#### Fixed
- String truncation breaking on unicode characters
- Ref parsing in SQLite storage
- Pagination for collection field sync steps
- Tab completion race condition

### Mar 2 – Mar 6, 2026

Connector ecosystem, field selectors, and dynamic registry.

#### Added
- Dynamic connector registry - connectors loaded from disk, no longer hardcoded
- Derived entity syncing - connectors can pull related entities alongside primary data
- GitHub Issues connector
- Google Workspace connector
- Claude Code Conversations connector
- Linear connector rewrite with support for circular entity references
- Field selectors: `.props`, `.meta`, `.all` and meta fields (`_id`, `_ref`)
- `max install` command for collection and connector registry
- Connector package verification with targeted error messages
- License and NOTICE files

#### Changed
- Improved CLI help text - shows only command-specific flags
- Tab completion improvements for `max -g search <target>`

#### Fixed
- SQL errors when table or column names collide with reserved words
- Installation folder not being written when a connector has no credentials

### Feb 4 – Feb 12, 2026

Core architecture and type system.

#### Added
- `@max/core` package with foundational types and utilities (`Ref`, `Scope`, `EntityDef`, `Page` etc)
- SQLite storage layer (`@max/storage-sqlite`)
- Sync execution layer with support for batching, data loading, and resolution
- Structured error system with named errors, error boundaries, and stack traces
- `@max/acme` test application for usage-testing Max
- Pagination support
- Daemon mode
- CLI tab completion (zsh)

### Jan 22 – Jan 28, 2026

Initial proof of concept.

#### Added
- CLI scaffold with command routing
- Google Drive connector with sync and pagination
- HubSpot connector
- Linear connector
- Filter system (`=`, `~=` contains/wildcard matching)
- Pagination support
- `max count` command with `--all` flag
- ndjson output format
- LLM bootstrap command for AI agent context generation

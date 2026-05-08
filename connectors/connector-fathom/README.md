# @max/connector-fathom

A Max connector for [Fathom](https://fathom.video) — syncs meeting recordings,
transcripts, summaries, and action items into Max's local data layer for
CLI-based querying.

## Prerequisites

- Max CLI installed and initialised (`max init`)
- A Fathom account with API access
- Your Fathom API token (find it at https://fathom.video/settings/api)

## Installation

```bash
# From the Max monorepo (connector is built-in)
max -g install --collection ./connectors

# Or from a standalone checkout
max -g install --collection /path/to/max/connectors
```

## Setup

```bash
max connect fathom
```

The onboarding flow will prompt you for:

1. **Fathom API token** — your bearer token for the Fathom API

The connector validates your credentials by fetching one page of recordings.

## Syncing

```bash
# Full sync (default: 5 pages ≈ 50 recordings)
max sync fathom

# The maxPages config controls how many pages of recordings to fetch.
# Each page contains ~10 recordings.
```

## Querying

Once synced, use standard Max CLI queries:

```bash
# List all recordings
max query fathom.FathomRecording

# Search recordings by title
max search "weekly standup" --connector fathom

# Get a specific recording's details
max query fathom.FathomRecording --filter "title contains 'Revolut'"

# List action items across all recordings
max query fathom.FathomActionItem

# Get transcript content
max query fathom.FathomTranscript
```

## Entities

| Entity | Description |
|--------|-------------|
| `FathomRecording` | Meeting metadata: title, date, URL, recorder, summary |
| `FathomParticipant` | Meeting participants (name or email) |
| `FathomActionItem` | Extracted action items with assignee and timestamp |
| `FathomTranscript` | Full meeting transcript text |

### Entity relationships

```
FathomRoot
  └── recordings: FathomRecording[]
        ├── participants: FathomParticipant[]
        ├── actionItems: FathomActionItem[]
        └── transcript: FathomTranscript
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `maxPages` | number | 5 | Pages of recordings to fetch per sync (~10 per page) |

## Limitations (V0.1)

- **Full sync only** — no incremental/delta sync. Each sync fetches all
  configured pages of recordings.
- **No folder filtering** — syncs all accessible recordings regardless of
  Fathom folder organisation.
- **No server-side search pass-through** — search is local only after sync.
- **Participant identity** — participants are stored per-recording without
  cross-recording deduplication.

## V0.2 Roadmap

- Incremental sync using `created_after` to append new recordings only
- Fathom folder support for scoped syncing
- Cross-recording participant deduplication (canonical actors)
- On-demand transcript loading (skip during initial sync, fetch when queried)

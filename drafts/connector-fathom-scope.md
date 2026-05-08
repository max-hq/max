# Connector-Fathom: Scope Assessment

## Overview

A Max connector for [Fathom](https://fathom.video) — syncs meeting recordings,
summaries, transcripts, and action items into the Max local data layer for
CLI-based querying. Solves the token-cost problem of querying Fathom via MCP at
scale by making the data locally queryable.

## Data Model (Entities)

Based on probing the Fathom MCP (not the raw API — the MCP reshapes the data),
the connector needs these entities:

| Entity | Source | Fields |
|--------|--------|--------|
| **FathomRoot** | Singleton | `recordings` (collection) |
| **FathomRecording** | `list_meetings` | `title`, `date`, `url`, `recordedBy`, `summary`, `summaryMarkdown`, `participants` (collection), `actionItems` (collection), `transcript` (ref) |
| **FathomParticipant** | Embedded in `list_meetings` | `name`, `email` |
| **FathomActionItem** | Embedded in `list_meetings` (with `include_action_items`) | `description`, `assignee`, `timestampUrl` |
| **FathomTranscript** | `get_meeting_transcript` | `content` (full text) |

### Entity rationale

- **FathomRecording** is the core entity. The MCP returns `recording_id` (integer),
  `title`, `url`, `recorded_by`, and a list of participants (mix of email addresses
  and display names). When `include_summary=true`, a full markdown summary is
  included inline. When `include_action_items=true`, structured action items are
  included.
- **FathomParticipant** is extracted from the participant list on each recording.
  The MCP returns participants as a flat list — some are email addresses, some are
  display names. No separate participant ID exists; we'll use a composite
  `recording_id:participant_index` or hash the name/email.
- **FathomActionItem** is extracted from the action items on each recording.
  Each has a description, assignee name, and a timestamp URL into the recording.
- **FathomTranscript** is fetched separately via `get_meeting_transcript`. Returns
  timestamped speaker segments as plain text. This is large (a 30-min call is ~10KB+)
  so it's loaded on-demand, not during the initial collection sync.

### Deferred from V0.1

- **FathomFolder** — `list_meeting_folders` exists but adds complexity for low
  value in the triage use case. Defer.
- **Search index** — `search_meetings` does server-side search. Not needed for
  local querying. Defer.
- **Granola meetings** — `query_granola_meetings` is a separate data source.
  Out of scope.

## Sync Strategy

**Full sync only.** The Fathom MCP does not expose:
- Webhooks or change feeds
- `updated_after` / `created_after` filters that could be used for incremental sync
  (correction: `created_after` IS available on `list_meetings` — usable for
  incremental append, but not for detecting updates to existing recordings)

### V0.1 sync approach

1. **Seed**: Create root, list all recordings (paginate via cursor, `max_pages`
   configurable, default 5 = ~50 recordings).
2. **Metadata pass**: For each recording, extract participants and action items
   from the list_meetings response (already included when `include_summary` and
   `include_action_items` are true). This avoids N+1 API calls.
3. **Transcript pass (deferred load)**: Transcripts are large. V0.1 loads them
   for all synced recordings, but this could be made on-demand in V0.2.

### V0.2 incremental strategy

Use `created_after` with the timestamp of the most recently synced recording to
append new recordings only. Updates to existing recordings (e.g. summary
regeneration) would still require a full resync. Fathom would need to expose an
`updated_after` filter or webhook for true incremental sync.

## Auth Shape

**API token.** The Fathom MCP server is already authenticated in the local
environment. The connector will call the Fathom REST API directly using an API
token (same token the MCP server uses).

Fathom's API uses bearer token auth: `Authorization: Bearer <token>`.

Onboarding flow:
1. Input: Fathom API token
2. Validate: Call list_meetings with limit 1
3. No workspace selection needed (Fathom is single-tenant per token)

## Assumptions & Gaps

| # | Assumption | Risk | Mitigation |
|---|-----------|------|------------|
| 1 | The Fathom REST API shape matches what the MCP returns | Medium — MCP may transform data | Build connector against observed MCP shapes first; adapt to raw API later |
| 2 | `recording_id` is stable and unique | Low — it's the primary key in Fathom | Use as entity ID |
| 3 | Participants have no stable ID | High — names/emails can vary across recordings | Use recording-scoped composite ID |
| 4 | No webhook support | Confirmed | Full sync only in V0.1; poll via `created_after` in V0.2 |
| 5 | Transcript size is manageable | Medium — long meetings produce large transcripts | Store as single text field; consider chunking in V0.2 |
| 6 | API rate limits are undocumented | Medium | Use conservative concurrency limit (5 concurrent) |

## V0.1 Scope

- Entities: FathomRoot, FathomRecording, FathomParticipant, FathomActionItem, FathomTranscript
- Sync: Full sync of recordings + summaries + action items + transcripts
- Auth: API token via onboarding flow
- Query: All standard Max CLI queries (`max search`, `max query`)
- Limit: Configurable `maxPages` (default 5, ~50 recordings per sync)

## V0.2 Candidates

- Incremental sync via `created_after`
- Folder support (FathomFolder entity + folder-based filtering)
- On-demand transcript loading (don't fetch all transcripts during sync)
- Richer participant deduplication (canonical actor across recordings)
- Search integration (pass-through to Fathom's server-side search)

## Effort Estimate

- **Entities + Schema**: 1 hour (5 entities, straightforward fields)
- **API Client**: 1 hour (3 endpoints: list, summary, transcript)
- **Operations + Loaders + Resolvers**: 2 hours
- **Seeder + Sync Plan**: 30 min
- **Onboarding**: 30 min
- **Testing + debugging**: 2 hours
- **Documentation**: 30 min

**Total: ~8 hours for a working V0.1**

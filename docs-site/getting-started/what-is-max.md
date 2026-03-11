# What is Max?

Max is a federated data query layer that **schematizes** and **reflects** source data right to where it's needed.

> Max turns any data source into a fast, agent-local, queryable data provider.

It's designed so that agents have fast and unfettered access to data — without needing to hit APIs or go through slow/limited MCP connectors.

Typical use cases include tooling like Linear, HubSpot, Jira, Google Drive — but any source can have a Max connector created for it.

## Why Max when MCP exists?

MCP is inherently restrictive, both from a throughput and a data-access perspective:

- **Throughput** — you are typically rate-limited
- **Access** — you only see what the API gives you an endpoint for, even though the data itself may be technically available

By pulling data **out** of a source and **schematizing** it, you get:

- **Unrestricted search** — the schema bares all
- **Unrestricted speed** — your Max node dictates its own throughput
- **Common query language** across all data sources
- Throughput cost paid only once (at sync time)

## How much faster?

This varies case-by-case, but here's a real-world example:

> *"What are the top 10 first names in HubSpot, and how many Google Drive files mention them in the title?"*

|         | Tokens | Time  | Cost    | vs MCP     |
|---------|--------|-------|---------|------------|
| **MCP** | 18M+   | 80m+  | $180+   | —          |
| **Max** | 238    | 27s   | $0.003  | **~75,630x** |

The MCP figures are extrapolated — we had to terminate mid-run due to repeated recompactions. Claude (alone) tried to paginate over 100,000 records from HubSpot, 200 at a time. With Max, it issued a single query.

## Architecture at a glance

Max is a set of protocols and libraries with a platform-agnostic core:

| Package            | Purpose                          | Platform agnostic |
|--------------------|----------------------------------|:-:|
| `@max/core`        | Types, utilities, Engine         | ✅ |
| `@max/connector`   | Connector SDK                    | ✅ |
| `@max/federation`  | Federation logic                 | ✅ |
| `@max/execution`   | Task/sync orchestration          | ✅ |
| `@max/cli`         | CLI presentation layer           | ❌ |
| `@max/platform-bun`| Bun runtime bindings             | — |
| `@max/storage-sqlite` | SQLite engine implementation  | — |

The data pipeline:

```
SyncPlan → Resolvers → Loaders → Engine → Storage
```

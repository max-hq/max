<div align="center">
  <br/>
    <pre>
 _____ _____ __ __
|     |  _  |  |  |
| | | |     |-   -|
|_|_|_|__|__|__|__|
</pre>
  <a href="https://max.cloud">Max</a> syncs data from any source into storage that you own.
  <br/>
  Your agents query the data locally - fast, unconstrained, and without API limits.
  <br/><br/>
</div>



Max syncs data from SaaS tools into local storage. Your agents query it there - fast, cheap, and without touching the upstream API.

It works with anything: Linear, GitHub, HubSpot, Google Drive, Hacker News, Hugging Face - [and more](https://github.com/max-hq/max-connectors).

## Install

```bash
curl -fsSL https://max.cloud/install.sh | sh
```

## Try it out

### On a public node

To get a feel for max, query live data on a public Max node:

```bash
# What are the most downloaded text-generation models?
max -t max://demo.max.cloud/max-demo/hf-popular search HfModel \                                                                                        (main✱)
  --filter 'pipelineTag = "text-generation" AND downloads > 10000' \
  --order-by downloads:desc \
  --fields id,downloads,likes

# Find open issues across a GitHub repo
max -t max://demo.max.cloud/max-demo/gh-pi-mono search GitHubIssue \                                                                                    (main✱)
  --filter 'state = "open"' \
  --order-by createdAt:desc \
  --fields title,author,state
  
# Show the schema for a node
max -t max://demo.max.cloud/max-demo/gh-pi-mono schema

```

### On your own data

```bash
max 
```

## Documentation and examples

**Documentation**:  [docs.max.cloud](https://docs.max.cloud).  
**Sample workspace**: `max://demo.max.cloud/max-demo` (use `max -t <uri>` to access this)    
**Sample workspace explorer**: [demo.max.cloud](https://demo.max.cloud). 


## Why bring data locally when MCP exists?

MCP over http typically pipes everything through your agent's context window. For exploring data, that's incredibly inefficient.

> *"What are the top 10 first names in HubSpot, and how many Google Drive files mention them in the title?"*

|         | Tokens | Time  | Cost    |
|---------|--------|-------|---------|
| **MCP** | 18M+   | 80m+  | $180+   |
| **Max** | 238    | 27s   | $0.003  |

In this benchmark, the agent (opus 4.5) asked HubSpot MCP for 100,000 contacts, 200 at a time, hitting compaction quickly.  
When given `max` with a connection to google and hubspot, the agent issued small handful of local queries.

The difference: with Max, data is already local, and it's CLI-friendly. Your agent runs `max search`, `grep`, `jq`, `sort` - whatever it needs, allowing data to be filtered *before* it hits the context window.

## Connect your own sources

```bash
# Add connectors from any collection
max -g install --collection git@github.com:max-hq/max-connectors.git

# Create a workspace
max init my-project && cd my-project

# Connect and sync
max connect @max/connector-linear --name linear-1
max sync linear-1

# Query
max search linear-1 LinearIssue \
  --filter 'state = "In Progress" AND labels ~= "bug"' \
  --fields title,assignee,priority
```

### Storage

Max's storage is modular by design - the first available module is `storage-sqlite`.  
This means queries run (typically) locally with high throughput and low latency - and without rate-limits.

## Give your agent access

```bash
max -g llm-bootstrap
```

This prints a context document that teaches your agent how to use Max - what's installed, what the schemas look like, how to search. Hand it to Claude, GPT, or whatever you're building with.

Your agent can then explore (`max schema`, `max ls`), query (`max search`), and pipe output into its own tools.

## Connectors

| Connector | What it syncs |
|-----------|---------------|
| [Linear](https://github.com/max-hq/max-connectors) | Issues, projects, teams, users |
| [GitHub](https://github.com/max-hq/max-connectors) | Repos, issues, users |
| [Google Workspace](https://github.com/max-hq/max-connectors) | Directory, users, groups |
| [Google Calendar](https://github.com/max-hq/max-connectors) | Calendars, events, attendees |
| [HubSpot](https://github.com/max-hq/max-connectors) | Contacts, companies, deals |
| [Hacker News](https://github.com/max-hq/max-connectors) | Stories, comments, users |
| [Hugging Face](https://github.com/max-hq/max-connectors) | Models, datasets, spaces |
| [Claude Code](https://github.com/max-hq/max-connectors) | Your conversation history |
| [Datadog](https://github.com/max-hq/max-connectors) | Incidents, metrics |
| [AWS Cost Explorer](https://github.com/max-hq/max-connectors) | Cost records, forecasts, budgets |

Writing a connector is straightforward - define entities, write loaders, wire them up. See the [connector SDK docs](https://docs.max.cloud/connector/entities-and-schema/).

## Use Max as a library

```typescript
import { BunPlatform } from "@max/platform-bun";

const max = await BunPlatform.createGlobalMax();
const installation = await max.installation("linear-1");

const issues = await installation.engine.query(
  Query.from(LinearIssue)
    .where("state", "=", "In Progress")
    .select("title", "assignee")
);
```

## Status

**Alpha.** Max is under active development. The core works - sync, query, connectors, federation - but expect rough edges. We're releasing early because we want feedback.

## Docs

Full documentation at [docs.max.cloud](https://docs.max.cloud), including:

- [Getting started](https://docs.max.cloud/guide/getting-started/)
- [Query syntax](https://docs.max.cloud/guide/querying-data/)
- [Agent integration](https://docs.max.cloud/guide/agent-integration/)
- [Writing connectors](https://docs.max.cloud/connector/entities-and-schema/)
- [Architecture](https://docs.max.cloud/architecture/)

## Contributing

We're not accepting code contributions yet while the API stabilises. But we'd love feedback:

- [Open an issue](https://github.com/max-hq/max/issues) for bugs, feature requests, or connector ideas
- Star the repo if you find it useful

## License

[Apache 2.0](./LICENSE)

---

Max is a trademark of Metomic Ltd.

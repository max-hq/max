# DESIGN: Source + Derivation Model

> Unified model for data fetching and multi-entity extraction.
> Date: 2026-03-04. Status: Design agreed, not yet implemented.

---

## Problem

A collection loader is typed as `(parentRef, page) → Page<EntityInput<TTarget>>` — it fetches paginated data from an API and produces entities of exactly one target type. Real-world APIs don't respect this boundary. When paginating GitHub issues, each issue comes with embedded user data (creator, assignee, reviewers). When listing Linear issues, assignee and project references carry enough data to populate those entities.

Today this forces a choice:

1. **Discard the embedded data.** Store only a bare `Ref` (e.g. `GithubUser.ref(creator.id)`) and re-fetch user details via a separate endpoint. This wastes API calls — you're paginating the same endpoint twice, or hitting a per-entity endpoint N times for data you already had.

2. **Denormalize.** Store user fields directly on the issue entity. This defeats the purpose of a normalized entity graph.

The Linear connector already demonstrates this tension. `TeamIssuesLoader` discards assignee details (name, email) and stores only `LinearUser.ref(i.assignee.id)`. Linear happens to have a separate `members` endpoint that covers users, so the data isn't permanently lost. Many APIs won't be this forgiving.

### Why the existing primitives don't solve this

**`dependsOn` + `RawLoader`** — The type system has scaffolding for loader dependencies, but the current `RawLoader` implementation is missing a parent ref parameter (an oversight from the original Maxwell proof-of-concept port — in Maxwell, the raw loader takes a ref like any other loader). Without a ref, it can't be triggered against a specific entity. Beyond that, trying to use raw loaders as shared paginated data sources creates a lifecycle mismatch — they have no pagination context. The execution layer also doesn't support either feature (`assertNoDeps` throws, no dispatch path for raw loaders).

**Side-effecting stores** — A loader could be given an `emit()` callback to store additional entities during execution. This breaks the declarative model: loaders are pure data-in, data-out functions. Side effects make the data flow invisible to the executor, the sync plan, and the developer reading the code.

---

## Core Insight

The current loader types conflate two concerns:

1. **Fetching data** — Making the API call, handling pagination
2. **Deriving entities** — Extracting typed `EntityInput` values from the response

When a single API response yields multiple entity types, these concerns need to be separated. This separation isn't just about the multi-entity case — it reveals that all loaders are really a data source paired with entity extraction logic. The existing loader types (`collection`, `entity`, `entityBatched`, `raw`) are DX sugar over this fundamental pattern.

---

## Proposed Model: Source + Derivation

### Source

A **Source** is a data fetcher bound to a parent entity. It owns the API call, returns typed raw data, and optionally handles pagination. There are two variants:

| Variant | Signature | Use case |
|---|---|---|
| `Source.paginated` | `(ref, page, ctx) → SourcePage<TData>` | Paginated endpoints (list issues, list members) |
| `Source.single` | `(ref, ctx) → TData` | Single-fetch endpoints (get user detail with extra data) |

Both variants take a parent ref — sources are always bound to an entity. This is possible because the entity graph always has a root entity, so even "global" data fetches can be expressed as a source on the root.

```typescript
// Paginated source — issues endpoint
const IssuesPage = Source.paginated({
  name: "github:repo:issues-page",
  context: GithubContext,
  parent: GithubRepo,

  async fetch(ref, page, ctx) {
    const result = await ctx.api.issues.list(ref.id, {
      cursor: page.cursor,
      limit: page.limit,
    });
    return SourcePage.from(
      result,
      result.pageInfo.hasNextPage,
      result.pageInfo.endCursor,
    );
  },
});

// Single source — user detail endpoint that returns extra org data
const UserDetail = Source.single({
  name: "github:user:detail",
  context: GithubContext,
  parent: GithubUser,

  async fetch(ref, ctx) {
    return await ctx.api.users.get(ref.id);
  },
});
```

A Source:
- Is always bound to a parent entity via ref
- Returns typed data (`TData`) — whatever the API gives you
- Handles pagination lifecycle (paginated variant) or returns a single result (single variant)
- Has no opinion about what entities exist in the data
- Knows all its derivations (they register via `.derive()`)

### Derivation

A **Derivation** is a pure function that extracts `EntityInput[]` for one target entity type from source output. Created via `source.derive()`.

```typescript
// Primary derivation: issues from the issues source
const RepoIssuesLoader = IssuesPage.derive({
  name: "github:repo:issues",
  target: GithubIssue,

  extract(data) {
    return data.issues.map(i =>
      EntityInput.create(GithubIssue.ref(i.id), {
        title: i.title,
        body: i.body,
        state: i.state,
        creator: i.creator ? GithubUser.ref(i.creator.id) : undefined,
      })
    );
  },
});

// Co-derivation: users discovered via issues
const IssueAuthorsLoader = IssuesPage.derive({
  name: "github:repo:issue-authors",
  target: GithubUser,

  extract(data) {
    const seen = new Set<string>();
    return data.issues
      .filter(i => i.creator && !seen.has(i.creator.id) && seen.add(i.creator.id))
      .map(i =>
        EntityInput.create(GithubUser.ref(i.creator.id), {
          login: i.creator.login,
          name: i.creator.name,
          avatarUrl: i.creator.avatarUrl,
        })
      );
  },
});
```

A Derivation:
- Is bound to a specific source (created via `source.derive()`)
- Targets a specific entity type (`target`)
- Is a pure function: source data in, `EntityInput[]` out — no I/O, no API calls
- Acts as a loader from the resolver's perspective (has `.field()` for resolver binding)
- Multiple derivations can share the same source

### The relationship

```
Source: IssuesPage
  │  fetch(ref, page, ctx) → SourcePage<IssuesApiResponse>
  │
  ├── derive → RepoIssuesLoader    → GithubIssue
  └── derive → IssueAuthorsLoader  → GithubUser
```

The source knows all its derivations. When the executor triggers a source, it runs **all** derivations on the result. One API call, one pagination pass, all entity types populated.

### How derivations receive source data

The executor is the coordinator. It does not invoke derivations independently — it calls the source once, then passes the same data object to every derivation's `extract()` function:

```
executor sees: loadCollection("issues") → resolves to RepoIssuesLoader (a derivation)
executor finds: RepoIssuesLoader.source = IssuesPage
executor finds: IssuesPage.derivations = [RepoIssuesLoader, IssueAuthorsLoader]

executor calls: IssuesPage.fetch(ref, page, ctx)    → pageData  (one API call)
executor calls: RepoIssuesLoader.extract(pageData)   → issues    (pure transform)
executor calls: IssueAuthorsLoader.extract(pageData)  → users     (pure transform)
executor stores all results
```

There is no `LoaderResults` bag, no runtime dependency lookup. The source fetches, the derivations transform, and the executor orchestrates the handoff. The data flow is structural and visible at registration time.

---

## Unified Model

Source + Derivation is the foundational primitive. The existing loader types are DX sugar on top of it.

| Loader type | What it really is | When to use |
|---|---|---|
| `Loader.collection()` | A paginated source with a single inline derivation | One API endpoint → one entity type |
| `Loader.entity()` | A single source with a single inline derivation | Load fields for one entity by ref |
| `Loader.entityBatched()` | A single source (batched) with a single inline derivation | Load fields for many entities in one call |
| `Source.paginated()` + `.derive()` | Explicit source with multiple derivations | One API endpoint → multiple entity types |
| `Source.single()` + `.derive()` | Explicit single-fetch source with multiple derivations | One API call → multiple entity types (no pagination) |

A connector author uses the sugar for simple cases (one API call, one entity type) and reaches for explicit Source + Derivation when a single endpoint yields multiple entity types. The executor treats them uniformly — standalone loaders and source-backed derivations are dispatched through the same path.

This is a singular, unified approach. There is no parallel world where some things use sources and others use a different concept. The sugar is a convenience layer over the same underlying model.

### Deprecations

**`Loader.raw()`** — Deprecated. A raw loader was intended to be a data source that doesn't map directly to an entity — which is exactly what a Source is. The current implementation has an oversight (missing parent ref parameter, carried over from the Maxwell proof-of-concept port), which made it seem limited to parentless config/metadata fetches. With Source, this is properly modelled: a `Source.single()` or `Source.paginated()` bound to any entity, with derivations that extract whatever entity types the data contains.

**`dependsOn` + `LoaderResults`** — The primary use case for `dependsOn` was shared data between loaders (a raw loader fetches data, other loaders consume it via `deps.get()`). Source + Derivation solves this structurally: the source fetches, derivations consume, and the data handoff is managed by the executor. The remaining edge case (cross-source data sharing, where a derivation from Source A needs data from Source B) is narrow enough to defer. Removal of `dependsOn` is a follow-up step — it can be removed once all use cases are confirmed covered by the Source model.

---

## Schema Integration

Co-derivations appear as collection fields on the parent entity. This is a deliberate choice — it gives each derivation a name in the domain model and makes it targetable by sync plans.

```typescript
const GithubRepo = EntityDef.create("GithubRepo", {
  name: Field.string(),
  description: Field.string(),
  issues: Field.collection(GithubIssue),
  issueAuthors: Field.collection(GithubUser),   // co-derivation, same API source
});
```

The resolver binds both fields:

```typescript
const GithubRepoResolver = Resolver.for(GithubRepo, {
  name: RepoBasicLoader.field("name"),
  description: RepoBasicLoader.field("description"),
  issues: RepoIssuesLoader.field(),
  issueAuthors: IssueAuthorsLoader.field(),
});
```

This means:
- `issueAuthors` is a first-class concept. A developer reading the schema sees it. The sync plan can target it.
- The fact that it shares a source with `issues` is an implementation detail of the connector, not exposed to the plan consumer.
- A user can say "re-sync the issue authors on this repo" without knowing it ultimately paginates the issues endpoint.

---

## Sync Plan Interaction

The sync plan speaks in field names. Sources are invisible at this layer.

```typescript
SyncPlan.create([
  Step.forRoot(orgRef).loadCollection("repos"),
  Step.forAll(GithubRepo).loadCollection("issues"),
  // No need to separately load issueAuthors —
  // the executor runs all derivations from the shared source.
])
```

When the executor processes `loadCollection("issues")`:

1. Resolves `"issues"` → `RepoIssuesLoader` (via the resolver)
2. Sees `RepoIssuesLoader` is a derivation from `IssuesPage`
3. Discovers all derivations from `IssuesPage`: `[RepoIssuesLoader, IssueAuthorsLoader]`
4. Paginates the source
5. For each page, runs both `extract()` functions
6. Stores all resulting `EntityInput` values
7. Records field syncs for both entity types

If the plan also contains `loadCollection("issueAuthors")` as a separate step, the executor recognises that the source was already fully paginated for that parent ref and the step becomes a no-op (via staleness checks in `syncMeta`).

The plan author can list both for clarity, or list just one and trust the co-derivation. Either way produces the same result.

---

## Multi-Source Entities

An entity type can be produced by multiple sources. This is the normal case — users come from the issues endpoint AND from a dedicated users endpoint.

```
IssuesPage (parent: GithubRepo)             UsersPage (parent: GithubOrg)
  ├─ RepoIssuesLoader   → GithubIssue        └─ OrgUsersLoader → GithubUser
  └─ IssueAuthorsLoader → GithubUser ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
                                                (same entity type,
                                                 different field coverage)
```

This works because:
- `engine.store()` is an upsert — partial writes merge, they don't clobber
- `syncMeta.recordFieldSync()` tracks which fields were populated and when
- The `GithubUser` resolver points to `OrgUsersLoader` (or a `UserBasicLoader`) as the **canonical** path for user fields
- If a `forAll(GithubUser).loadFields(...)` step runs later, it checks per-field staleness and skips anything already populated by either source

The canonical resolver for `GithubUser` doesn't reference `IssueAuthorsLoader`. That derivation is **opportunistic** — tracked, stored, and visible in the schema, but not the canonical source of truth for user fields.

---

## Type Sketch

### SourcePage

```typescript
interface SourcePage<TData> {
  readonly data: TData;
  readonly hasMore: boolean;
  readonly cursor?: string;
}

const SourcePage = {
  from<TData>(data: TData, hasMore: boolean, cursor?: string): SourcePage<TData>;
};
```

### PaginatedSource

```typescript
interface PaginatedSource<
  TData,
  TParent extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny,
> {
  readonly kind: "paginated";
  readonly name: SourceName;
  readonly context: ClassOf<TContext>;
  readonly parent: TParent;
  readonly derivations: readonly SourceDerivation<TData, EntityDefAny>[];

  fetch(
    ref: Ref<TParent>,
    page: PageRequest,
    ctx: InferContext<TContext>,
  ): Promise<SourcePage<TData>>;

  derive<TTarget extends EntityDefAny>(config: {
    name: LoaderName;
    target: TTarget;
    extract: (data: TData) => EntityInput<TTarget>[];
  }): SourceDerivation<TData, TTarget>;
}
```

### SingleSource

```typescript
interface SingleSource<
  TData,
  TParent extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny,
> {
  readonly kind: "single";
  readonly name: SourceName;
  readonly context: ClassOf<TContext>;
  readonly parent: TParent;
  readonly derivations: readonly SourceDerivation<TData, EntityDefAny>[];

  fetch(
    ref: Ref<TParent>,
    ctx: InferContext<TContext>,
  ): Promise<TData>;

  derive<TTarget extends EntityDefAny>(config: {
    name: LoaderName;
    target: TTarget;
    extract: (data: TData) => EntityInput<TTarget>[];
  }): SourceDerivation<TData, TTarget>;
}
```

### SourceDerivation

A derivation acts as a loader from the resolver's perspective. It has a `target`, an `entity` (inherited from the source's parent), and a `.field()` method for use in `Resolver.for()`.

```typescript
interface SourceDerivation<
  TData,
  TTarget extends EntityDefAny = EntityDefAny,
> {
  readonly source: PaginatedSource<TData> | SingleSource<TData>;
  readonly name: LoaderName;
  readonly target: TTarget;
  readonly entity: EntityDefAny;  // inherited from source.parent

  extract(data: TData): EntityInput<TTarget>[];

  /** For use in Resolver.for() — same interface as CollectionLoader.field() */
  field(sourceField?: string): FieldAssignment;
}
```

### Source companion

```typescript
type SourceName = Id<"source-name">;

const Source = StaticTypeCompanion({
  paginated<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      page: PageRequest,
      ctx: InferContext<TContext>,
    ) => Promise<SourcePage<TData>>;
  }): PaginatedSource<TData, TParent, TContext>;

  single<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      ctx: InferContext<TContext>,
    ) => Promise<TData>;
  }): SingleSource<TData, TParent, TContext>;
});
```

---

## Executor Changes

The `DefaultTaskRunner` needs to detect source-backed derivations and coordinate them.

### Detection

When executing a `load-collection` or `load-fields` task, the task runner checks whether the resolved loader is a `SourceDerivation`. If so, it delegates to the source rather than calling the loader directly.

### Coordination (paginated source)

```
executeLoadCollectionForRef(entityDef, refKey, field, cursor)
  │
  ├── loader is standalone CollectionLoader?
  │     → existing path: loader.load(ref, page, ctx, deps)
  │
  └── loader is SourceDerivation from PaginatedSource?
        → source = loader.source
        → sourcePage = source.fetch(ref, pageRequest, ctx)
        → for each derivation of source:
        │     items = derivation.extract(sourcePage.data)
        │     for each item: engine.store(item), recordFieldSync(...)
        → if sourcePage.hasMore: spawn continuation child
```

### Coordination (single source)

```
executeLoadFieldsForRef(entityDef, refKey, fields)
  │
  ├── loader is standalone EntityLoader?
  │     → existing path: loader.load(ref, ctx, deps)
  │
  └── loader is SourceDerivation from SingleSource?
        → source = loader.source
        → data = source.fetch(ref, ctx)
        → for each derivation of source:
        │     items = derivation.extract(data)
        │     for each item: engine.store(item), recordFieldSync(...)
```

The continuation child (paginated case) carries the source's cursor. When it runs, it fetches the next page and runs all derivations again. Pagination is driven by the source, not by any individual derivation.

### Task payload

The existing `load-collection` and `load-fields` payloads work without changes — they reference the entity type, field, and cursor. The task runner resolves the field to a loader (which may be a derivation), discovers the source, and proceeds. No new task kind is needed.

---

## Sync Reporting (Future)

Once sources exist as a concept, the sync reporter should surface them. Rather than reporting two progress lines that advance in lockstep:

```
Loading github:repo:issues        page 3   250 items
Loading github:repo:issue-authors  page 3    89 items
```

Report the source with its derivation breakdown:

```
Loading github:repo:issues-page  page 3  →  250 issues, 89 users
```

This is a natural follow-on once the primitive exists. Not required for the initial implementation.

---

## Implementation Considerations

### What needs to change

| Area | Change |
|------|--------|
| `@max/core` | New `Source` companion, `SourcePage`, `PaginatedSource`, `SingleSource`, `SourceDerivation` types |
| `@max/core` | `SourceDerivation` implements the same interface contract as loaders for resolver compatibility |
| `@max/core` | Deprecate `Loader.raw()` |
| `@max/execution-local` | `DefaultTaskRunner` gains source-aware dispatch path (detect derivation → delegate to source → run all co-derivations) |
| `@max/execution` | `ExecutionRegistry` indexes derivations by source for co-derivation discovery |

### What stays the same

| Area | Why |
|------|-----|
| `Loader.collection()` | Unchanged — DX sugar for the simple 1:1 case |
| `Loader.entity()` | Unchanged — DX sugar for single-entity field loading |
| `Loader.entityBatched()` | Unchanged — DX sugar for batched field loading |
| `Resolver.for()` | Derivations produce `FieldAssignment` just like loaders |
| `SyncPlan` / `Step` | Operates on field names — sources are invisible at this layer |
| `TaskPayload` | Existing payload kinds are sufficient — no new task kind |
| `engine.store()` | Already an upsert — handles multi-source entities naturally |
| `syncMeta.recordFieldSync()` | Already per-field — tracks coverage from any source |

### What to defer

- **`Source` in sync plan** — Exposing the ability to target a source directly from the sync plan (e.g. `Step.forAll(GithubRepo).loadSource(IssuesPage)`). This gives finer control but creates a gap between the user and the thing they're trying to sync. Keep sources as a connector-internal concept for now. Plausible future extension if explicit source control proves valuable.

- **Source-level sync reporting** — Useful for understanding sync progress but not required for correctness. The existing per-loader progress reporting works; source-aware reporting is an enhancement.

- **`dependsOn` removal** — Follow-up step. The primary use case for `dependsOn` (shared data between loaders) is now covered by Source + Derivation. The remaining edge case (cross-source data sharing) is narrow. Remove `dependsOn` and `LoaderResults` once all use cases are confirmed covered.

---

## Worked Example: GitHub Connector

### Entities

```typescript
const GithubUser = EntityDef.create("GithubUser", {
  login: Field.string(),
  name: Field.string(),
  email: Field.string(),
  avatarUrl: Field.string(),
  bio: Field.string(),
});

const GithubIssue = EntityDef.create("GithubIssue", {
  number: Field.number(),
  title: Field.string(),
  body: Field.string(),
  state: Field.string(),
  creator: Field.ref(GithubUser),
  assignee: Field.ref(GithubUser),
});

const GithubRepo = EntityDef.create("GithubRepo", {
  name: Field.string(),
  description: Field.string(),
  issues: Field.collection(GithubIssue),
  issueAuthors: Field.collection(GithubUser),
});

const GithubOrg = EntityDef.create("GithubOrg", {
  name: Field.string(),
  repos: Field.collection(GithubRepo),
  members: Field.collection(GithubUser),
});
```

### Sources and derivations

```typescript
// Issues source — paginates the issues endpoint
const IssuesPage = Source.paginated({
  name: "github:repo:issues-page",
  context: GithubContext,
  parent: GithubRepo,

  async fetch(ref, page, ctx) {
    const result = await ctx.api.issues.list(ref.id, {
      cursor: page.cursor,
      limit: page.limit,
    });
    return SourcePage.from(
      result,
      result.pageInfo.hasNextPage,
      result.pageInfo.endCursor,
    );
  },
});

// Derive issues
const RepoIssuesLoader = IssuesPage.derive({
  name: "github:repo:issues",
  target: GithubIssue,
  extract(data) {
    return data.issues.map(i =>
      EntityInput.create(GithubIssue.ref(i.id), {
        number: i.number,
        title: i.title,
        body: i.body,
        state: i.state,
        creator: i.user ? GithubUser.ref(i.user.id) : undefined,
        assignee: i.assignee ? GithubUser.ref(i.assignee.id) : undefined,
      })
    );
  },
});

// Derive users seen in issues
const IssueAuthorsLoader = IssuesPage.derive({
  name: "github:repo:issue-authors",
  target: GithubUser,
  extract(data) {
    const seen = new Set<string>();
    const users: EntityInput<typeof GithubUser>[] = [];
    for (const issue of data.issues) {
      for (const u of [issue.user, issue.assignee].filter(Boolean)) {
        if (!seen.has(u.id)) {
          seen.add(u.id);
          users.push(EntityInput.create(GithubUser.ref(u.id), {
            login: u.login,
            name: u.name ?? undefined,
            avatarUrl: u.avatar_url,
          }));
        }
      }
    }
    return users;
  },
});

// Members — simple case, standalone collection loader (no source needed)
const OrgMembersLoader = Loader.collection({
  name: "github:org:members",
  context: GithubContext,
  entity: GithubOrg,
  target: GithubUser,
  async load(ref, page, ctx) {
    const result = await ctx.api.orgs.listMembers(ref.id, {
      cursor: page.cursor,
      limit: page.limit,
    });
    const items = result.members.map(u =>
      EntityInput.create(GithubUser.ref(u.id), {
        login: u.login,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatar_url,
        bio: u.bio,
      })
    );
    return Page.from(items, result.pageInfo.hasNextPage, result.pageInfo.endCursor);
  },
});
```

### Resolvers

```typescript
const GithubRepoResolver = Resolver.for(GithubRepo, {
  name: RepoBasicLoader.field("name"),
  description: RepoBasicLoader.field("description"),
  issues: RepoIssuesLoader.field(),
  issueAuthors: IssueAuthorsLoader.field(),
});

const GithubOrgResolver = Resolver.for(GithubOrg, {
  name: OrgBasicLoader.field("name"),
  repos: OrgReposLoader.field(),
  members: OrgMembersLoader.field(),
});

// GithubUser resolver — canonical path is the standalone entity loader
const GithubUserResolver = Resolver.for(GithubUser, {
  login: UserBasicLoader.field("login"),
  name: UserBasicLoader.field("name"),
  email: UserBasicLoader.field("email"),
  avatarUrl: UserBasicLoader.field("avatarUrl"),
  bio: UserBasicLoader.field("bio"),
});
```

### Sync plan

```typescript
SyncPlan.create([
  Step.forRoot(orgRef).loadCollection("repos"),
  Step.forRoot(orgRef).loadCollection("members"),
  Step.forAll(GithubRepo).loadCollection("issues"),
  // issueAuthors populated automatically via shared source.
  // The plan doesn't need to mention it — but could, for explicitness.
])
```

### What happens at runtime

1. `loadCollection("repos")` — discovers repos via the repos endpoint
2. `loadCollection("members")` — discovers users via the members endpoint (full field coverage)
3. `loadCollection("issues")` — paginates the issues endpoint. For each page:
   - Executor calls `IssuesPage.fetch(ref, page, ctx)` — one API call
   - `RepoIssuesLoader.extract(pageData)` produces `GithubIssue` entities (with `GithubUser` refs)
   - `IssueAuthorsLoader.extract(pageData)` produces `GithubUser` entities (partial: login, name, avatarUrl)
   - All stored. Users that already exist from step 2 get a merge (idempotent). Users not yet seen get partial data — the resolver's canonical `UserBasicLoader` can fill gaps if a `loadFields` step follows.

---

## Open Questions

1. **Derivation ordering within a source.** When multiple derivations run on the same page, does the order matter? Probably not — each derivation produces independent `EntityInput` values that are stored independently. But if a derivation's output references entities produced by a sibling derivation (e.g., the issue references a user created by the co-derivation), the store order might matter for foreign key constraints. Need to verify that `engine.store()` handles forward references gracefully.

2. **Partial field coverage semantics.** When `IssueAuthorsLoader` populates 3 of 5 fields on a `GithubUser`, and a later `loadFields` step asks for all 5, the staleness check should recognise that 3 are fresh and only load the remaining 2. This requires the executor to be field-granular when deciding what to load — which it already is via `syncMeta.staleFields()`. Verify this works end-to-end with source-derived data.

3. **Source naming convention.** Sources need names for serialisation and debugging. Proposed convention: `{namespace}:{parent-entity}:{description}-page` for paginated, `{namespace}:{parent-entity}:{description}` for single. Open to alternatives.

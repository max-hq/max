---
title: Advanced Patterns
sidebar:
  order: 6
---

This part covers Source + Derivation - an optimization for connectors where a single API endpoint returns data for multiple entity types.

## The problem

When designing entity models you face a trade-off:

- **Flat:** One paginated collection on the root. Efficient to sync (single cursor), but you lose relational structure.
- **Hierarchical:** Parent entities with child collections (e.g., Workspace → Users). Rich structure, but sync becomes m × n - one loader call per parent, each paginates children.

Source + Derivation eliminates this trade-off: one pagination pass, multiple entity types.

## How it works

A **Source** owns a single paginated API call and returns raw data. **Derivations** are pure functions that each extract one entity type from the source output. The engine runs all co-derivations on each page automatically.

```typescript
// Source - one paginated API call
const IssuesPageSource = Loader.paginatedSource({
  name: "github:repo:issues-page",
  context: GithubContext,
  parent: GithubRepo,
  async fetch(ref, page, ctx) {
    const result = await ctx.api.issues.list(ref.id, { cursor: page.cursor });
    return SourcePage.from(result, result.hasMore, result.cursor);
  },
});

// Primary derivation - issues
const RepoIssuesLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "github:repo:issues",
  target: GithubIssue,
  extract(data) {
    return data.issues.map(i =>
      EntityInput.create(GithubIssue.ref(i.id), {
        title: i.title,
        state: i.state,
        creator: GithubUser.ref(i.creator.id),
      })
    );
  },
});

// Co-derivation - authors extracted from the same data, no extra API call
const IssueAuthorsLoader = Loader.deriveEntities(IssuesPageSource, {
  name: "github:repo:issue-authors",
  target: GithubUser,
  extract(data) {
    const seen = new Set();
    return data.issues
      .filter(i => !seen.has(i.creator.id) && seen.add(i.creator.id))
      .map(i =>
        EntityInput.create(GithubUser.ref(i.creator.id), {
          login: i.creator.login,
        })
      );
  },
});
```

The sync plan only needs a step for the primary derivation - co-derivations run automatically:

```typescript
SyncPlan.create([
  Step.forRoot(rootRef).loadCollection("repos"),
  Step.forAll(GithubRepo).loadCollection("issues"),
  // No step needed for issueAuthors - handled by co-derivation
]);
```

## When to use it

The numbers matter. Consider a connector with 1,000 repos, each with 1,000 issues. A hierarchical model using `Step.forAll(GithubRepo).loadCollection("issues")` triggers one paginated loader call per repo - that's 1,000 API calls minimum. If each issue also implies an author entity and you use a separate step, that's another 1,000,000 calls.

With Source + Derivation, you make 1,000 paginated calls (one per repo), and each page yields both issues and authors. The million-call problem drops to a thousand.

**Use it when:**
- A single API endpoint returns data for multiple entity types
- Your sync plan would have `Step.forAll(X).loadCollection(Y)` where X could have thousands of instances

**Don't use it when:**
- Each entity type has its own efficient, dedicated endpoint
- The API requires per-parent calls (e.g., the only way to get members is `GET /groups/:id/members`)

## Source variants

| Factory | Signature | Use case |
|---------|-----------|----------|
| `Loader.paginatedSource()` | `(ref, page, ctx) => SourcePage<TData>` | Paginated API calls |
| `Loader.singleSource()` | `(ref, ctx) => TData` | Non-paginated API calls |

Both can be consumed by `Loader.deriveEntities()`.

## Quick reference

```typescript
// Entities
EntityDef.create("Name", { field: Field.string() })

// Fields
Field.string()          Field.number()          Field.boolean()
Field.date()            Field.ref(Target)       Field.collection(Target)
Field.refThunk(() => Target)

// Schema
Schema.create({ namespace: "acme", entities: [...], roots: [...] })

// Context
class MyContext extends Context {
  api = Context.instance<ApiClient>();
  tenantId = Context.string;
}

// Credentials
Credential.string("api_token")
Credential.oauth({ refreshToken, accessToken, expiresIn, refresh })

// Operations
Operation.define({ name, handle: async (input, ctx) => result })
env.ops.execute(MyOperation, { ...input })

// Loaders
Loader.entity({ name, context, entity, load: async (ref, env) => EntityInput })
Loader.entityBatched({ name, context, entity, load: async (refs, env) => Batch })
Loader.collection({ name, context, entity, target, load: async (ref, page, env) => Page })
Loader.paginatedSource({ name, context, parent, fetch: async (ref, page, env) => SourcePage })
Loader.singleSource({ name, context, parent, fetch: async (ref, env) => TData })
Loader.deriveEntities(source, { name, target, extract: (data) => EntityInput[] })

// Resolver
Resolver.for(Entity, { field: Loader.field("field"), collection: CollLoader.field() })

// Seeder
Seeder.create({ context, seed: async (ctx, engine) => SyncPlan })

// SyncPlan
SyncPlan.create([
  Step.forRoot(ref).loadCollection("children"),
  Step.forAll(Entity).loadFields("a", "b"),
  Step.concurrent([...]),
])

// Onboarding
const step1 = OnboardingFlow.InputStep.create({ label, fields, credentials })
const step2 = OnboardingFlow.ValidationStep.after(step1, { label, validate })
const step3 = OnboardingFlow.SelectStep.after(step2, { label, field, options })
OnboardingFlow.create<TConfig>([step1, step2, step3])

// ConnectorDef
ConnectorDef.create<TConfig>({
  name, displayName, description, icon, version, scopes,
  schema, onboarding, seeder, resolvers, operations,
})

// ConnectorModule
ConnectorModule.create<TConfig>({
  def: myDef,
  initialise(config, credentials) {
    return Installation.create({ context, start, stop, health });
  },
})
```

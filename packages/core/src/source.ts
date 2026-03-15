/**
 * Source + Derivation - Separates data fetching from entity derivation.
 *
 * A Source owns an API call and pagination. A Derivation is a pure function
 * that extracts EntityInput[] for one entity type from the source's output.
 * Multiple derivations can share a single source - one API call, one
 * pagination pass, multiple entity types populated.
 *
 * Sources are stateless - they don't know which derivations consume their
 * output. Co-derivation discovery is handled by the ExecutionRegistry.
 *
 * @example
 * const IssuesPage = Loader.paginatedSource({
 *   name: "github:repo:issues-page",
 *   context: GithubContext,
 *   parent: GithubRepo,
 *   async fetch(ref, page, env) {
 *     const result = await env.ops.execute(ListIssues, { repoId: ref.id, cursor: page.cursor });
 *     return SourcePage.from(result, result.hasMore, result.cursor);
 *   },
 * });
 *
 * const RepoIssuesLoader = Loader.deriveEntities(IssuesPage, {
 *   name: "github:repo:issues",
 *   target: GithubIssue,
 *   extract(data) {
 *     return data.issues.map(i => EntityInput.create(GithubIssue.ref(i.id), { ... }));
 *   },
 * });
 */

import { StaticTypeCompanion } from './companion.js'
import type { Id } from './brand.js'
import type { EntityDefAny } from './entity-def.js'
import type { EntityInput } from './entity-input.js'
import type { Ref } from './ref.js'
import type { PageRequest } from './pagination.js'
import type { ContextDefAny } from './context-def.js'
import type { LoaderEnv } from './loader-env.js'
import type { ClassOf } from './type-system-utils.js'
import type { BaseLoader, FieldAssignment, LoaderName, LoaderStrategy } from './loader.js'

// ============================================================================
// Branded Types
// ============================================================================

/**
 * SourceName - Soft-branded identifier for sources.
 */
export type SourceName = Id<"source-name">;

// ============================================================================
// SourcePage
// ============================================================================

/**
 * SourcePage - A page of raw data from a source, with pagination metadata.
 *
 * Unlike Page<T> which wraps EntityInput items, SourcePage wraps the raw API
 * response. Derivations extract entities from it.
 */
export interface SourcePage<TData> {
  readonly data: TData;
  readonly hasMore: boolean;
  readonly cursor?: string;
}

class SourcePageImpl<TData> implements SourcePage<TData> {
  constructor(
    readonly data: TData,
    readonly hasMore: boolean,
    readonly cursor?: string,
  ) {}
}

export const SourcePage = StaticTypeCompanion({
  from<TData>(data: TData, hasMore: boolean, cursor?: string): SourcePage<TData> {
    return new SourcePageImpl(data, hasMore, cursor);
  },
});

// ============================================================================
// PaginatedSource
// ============================================================================

/**
 * PaginatedSource - Fetches paginated data from an API, bound to a parent entity.
 *
 * Stateless: does not know which derivations consume its output.
 * Use Loader.deriveEntities() to create derivations that reference this source.
 */
export interface PaginatedSource<
  TData,
  TParent extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny,
> {
  readonly kind: "paginated";
  readonly name: SourceName;
  readonly context: ClassOf<TContext>;
  readonly parent: TParent;

  fetch(
    ref: Ref<TParent>,
    page: PageRequest,
    env: LoaderEnv<TContext>,
  ): Promise<SourcePage<TData>>;
}

// ============================================================================
// SingleSource
// ============================================================================

/**
 * SingleSource - Fetches data in a single call, bound to a parent entity.
 *
 * Like PaginatedSource but without pagination. Useful for endpoints that
 * return all data in one call and yield multiple entity types.
 * Stateless: does not know which derivations consume its output.
 */
export interface SingleSource<
  TData,
  TParent extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny,
> {
  readonly kind: "single";
  readonly name: SourceName;
  readonly context: ClassOf<TContext>;
  readonly parent: TParent;

  fetch(
    ref: Ref<TParent>,
    env: LoaderEnv<TContext>,
  ): Promise<TData>;
}

// ============================================================================
// DerivedEntityLoader
// ============================================================================

/**
 * DerivedEntityLoader - A pure function that extracts EntityInput[] for one entity
 * type from source output. Acts as a loader from the resolver's perspective.
 *
 * Included in the LoaderAny union with kind: "derivation". Extends BaseLoader
 * so it works with the execution registry and task runner unchanged.
 */
export interface DerivedEntityLoader<
  TData,
  TTarget extends EntityDefAny = EntityDefAny,
  TParent extends EntityDefAny = EntityDefAny,
> extends BaseLoader<ContextDefAny> {
  readonly kind: "derivation";
  readonly source: PaginatedSource<TData> | SingleSource<TData>;
  readonly name: LoaderName;
  readonly target: TTarget;
  /** The parent entity this derivation hangs off (inherited from source.parent). */
  readonly parent: TParent;

  extract(data: TData): EntityInput<TTarget>[];

  /** For use in Resolver.for() - same interface as CollectionLoader.field() */
  field(sourceField?: string): FieldAssignment<TParent>;
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Any source type (fully erased).
 */
export type SourceAny =
  | PaginatedSource<any>
  | SingleSource<any>;

/**
 * Any derivation type (fully erased).
 */
export type DerivedEntityLoaderAny = DerivedEntityLoader<unknown>;

// ============================================================================
// Implementations
// ============================================================================

export class PaginatedSourceImpl<
  TData,
  TParent extends EntityDefAny,
  TContext extends ContextDefAny,
> implements PaginatedSource<TData, TParent, TContext> {
  readonly kind = 'paginated' as const

  constructor(
    readonly name: SourceName,
    readonly context: ClassOf<TContext>,
    readonly parent: TParent,
    private fetchFn: (
      ref: Ref<TParent>,
      page: PageRequest,
      env: LoaderEnv<TContext>
    ) => Promise<SourcePage<TData>>
  ) {}

  fetch(
    ref: Ref<TParent>,
    page: PageRequest,
    env: LoaderEnv<TContext>
  ): Promise<SourcePage<TData>> {
    return this.fetchFn(ref, page, env)
  }
}

export class SingleSourceImpl<
  TData,
  TParent extends EntityDefAny,
  TContext extends ContextDefAny,
> implements SingleSource<TData, TParent, TContext> {
  readonly kind = 'single' as const

  constructor(
    readonly name: SourceName,
    readonly context: ClassOf<TContext>,
    readonly parent: TParent,
    private fetchFn: (ref: Ref<TParent>, env: LoaderEnv<TContext>) => Promise<TData>
  ) {}

  fetch(ref: Ref<TParent>, env: LoaderEnv<TContext>): Promise<TData> {
    return this.fetchFn(ref, env)
  }
}

export class DerivedEntityLoaderImpl<
  TData,
  TTarget extends EntityDefAny,
  TParent extends EntityDefAny,
> implements DerivedEntityLoader<TData, TTarget, TParent> {
  readonly kind = 'derivation' as const
  readonly strategy: LoaderStrategy = 'autoload'

  constructor(
    readonly source: PaginatedSource<TData> | SingleSource<TData>,
    readonly name: LoaderName,
    readonly target: TTarget,
    readonly parent: TParent,
    readonly context: ClassOf<ContextDefAny>,
    private extractFn: (data: TData) => EntityInput<TTarget>[]
  ) {}

  extract(data: TData): EntityInput<TTarget>[] {
    return this.extractFn(data)
  }

  field(sourceField?: string): FieldAssignment<TParent> {
    return { loader: this, sourceField, _entity: this.parent }
  }
}

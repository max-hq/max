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
 * const IssuesPage = Source.paginated({
 *   name: "github:repo:issues-page",
 *   context: GithubContext,
 *   parent: GithubRepo,
 *   async fetch(ref, page, ctx) {
 *     const result = await ctx.api.issues.list(ref.id, { cursor: page.cursor });
 *     return SourcePage.from(result, result.hasMore, result.cursor);
 *   },
 * });
 *
 * const RepoIssuesLoader = Source.derive(IssuesPage, {
 *   name: "github:repo:issues",
 *   target: GithubIssue,
 *   extract(data) {
 *     return data.issues.map(i => EntityInput.create(GithubIssue.ref(i.id), { ... }));
 *   },
 * });
 */

import {StaticTypeCompanion} from "./companion.js";
import type {Id} from "./brand.js";
import type {EntityDefAny} from "./entity-def.js";
import type {EntityInput} from "./entity-input.js";
import type {Ref} from "./ref.js";
import type {PageRequest} from "./pagination.js";
import type {ContextDefAny, InferContext} from "./context-def.js";
import type {ClassOf} from "./type-system-utils.js";
import type {LoaderName, LoaderStrategy, LoaderAny, FieldAssignment} from "./loader.js";

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
 * Use Source.derive() to create derivations that reference this source.
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
    ctx: InferContext<TContext>,
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
    ctx: InferContext<TContext>,
  ): Promise<TData>;
}

// ============================================================================
// SourceDerivation
// ============================================================================

/**
 * SourceDerivation - A pure function that extracts EntityInput[] for one entity
 * type from source output. Acts as a loader from the resolver's perspective.
 *
 * Included in the LoaderAny union with kind: "derivation". Has BaseLoader-
 * compatible properties (name, strategy, dependsOn, context) so it works
 * with the execution registry and task runner unchanged.
 */
export interface SourceDerivation<
  TData,
  TTarget extends EntityDefAny = EntityDefAny,
  TParent extends EntityDefAny = EntityDefAny,
> {
  readonly kind: "derivation";
  readonly source: PaginatedSource<TData> | SingleSource<TData>;
  readonly name: LoaderName;
  readonly target: TTarget;
  /** The parent entity this derivation hangs off (inherited from source.parent). */
  readonly parent: TParent;

  // BaseLoader-compatible properties
  readonly strategy: LoaderStrategy;
  readonly dependsOn: readonly LoaderAny[];
  readonly context: ClassOf<ContextDefAny>;

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
  | PaginatedSource<any, EntityDefAny, ContextDefAny>
  | SingleSource<any, EntityDefAny, ContextDefAny>;

/**
 * Any derivation type (fully erased).
 */
export type SourceDerivationAny = SourceDerivation<unknown, EntityDefAny, EntityDefAny>;

// ============================================================================
// Implementations
// ============================================================================

class PaginatedSourceImpl<
  TData,
  TParent extends EntityDefAny,
  TContext extends ContextDefAny,
> implements PaginatedSource<TData, TParent, TContext> {
  readonly kind = "paginated" as const;

  constructor(
    readonly name: SourceName,
    readonly context: ClassOf<TContext>,
    readonly parent: TParent,
    private fetchFn: (
      ref: Ref<TParent>,
      page: PageRequest,
      ctx: InferContext<TContext>,
    ) => Promise<SourcePage<TData>>,
  ) {}

  fetch(
    ref: Ref<TParent>,
    page: PageRequest,
    ctx: InferContext<TContext>,
  ): Promise<SourcePage<TData>> {
    return this.fetchFn(ref, page, ctx);
  }
}

class SingleSourceImpl<
  TData,
  TParent extends EntityDefAny,
  TContext extends ContextDefAny,
> implements SingleSource<TData, TParent, TContext> {
  readonly kind = "single" as const;

  constructor(
    readonly name: SourceName,
    readonly context: ClassOf<TContext>,
    readonly parent: TParent,
    private fetchFn: (
      ref: Ref<TParent>,
      ctx: InferContext<TContext>,
    ) => Promise<TData>,
  ) {}

  fetch(
    ref: Ref<TParent>,
    ctx: InferContext<TContext>,
  ): Promise<TData> {
    return this.fetchFn(ref, ctx);
  }
}

class SourceDerivationImpl<TData, TTarget extends EntityDefAny, TParent extends EntityDefAny>
  implements SourceDerivation<TData, TTarget, TParent>
{
  readonly kind = "derivation" as const;
  readonly strategy: LoaderStrategy = "autoload";
  readonly dependsOn: readonly LoaderAny[] = [];

  constructor(
    readonly source: PaginatedSource<TData> | SingleSource<TData>,
    readonly name: LoaderName,
    readonly target: TTarget,
    readonly parent: TParent,
    readonly context: ClassOf<ContextDefAny>,
    private extractFn: (data: TData) => EntityInput<TTarget>[],
  ) {}

  extract(data: TData): EntityInput<TTarget>[] {
    return this.extractFn(data);
  }

  field(sourceField?: string): FieldAssignment<TParent> {
    return {loader: this, sourceField, _entity: this.parent};
  }
}

// ============================================================================
// Source Static Companion
// ============================================================================

export const Source = StaticTypeCompanion({
  /**
   * Create a paginated source.
   */
  paginated<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      page: PageRequest,
      ctx: InferContext<TContext>,
    ) => Promise<SourcePage<TData>>;
  }): PaginatedSource<TData, TParent, TContext> {
    return new PaginatedSourceImpl(
      config.name,
      config.context,
      config.parent,
      config.fetch,
    );
  },

  /**
   * Create a single-fetch source.
   */
  single<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      ctx: InferContext<TContext>,
    ) => Promise<TData>;
  }): SingleSource<TData, TParent, TContext> {
    return new SingleSourceImpl(
      config.name,
      config.context,
      config.parent,
      config.fetch,
    );
  },

  /**
   * Creates a SourceDerivation that produces entities of the given type from the target input Source
   */
  deriveEntities<
    TData,
    TParent extends EntityDefAny,
    TTarget extends EntityDefAny,
  >(
    source: PaginatedSource<TData, TParent, any> | SingleSource<TData, TParent, any>,
    config: {
      name: LoaderName;
      target: TTarget;
      extract: (data: TData) => EntityInput<TTarget>[];
    },
  ): SourceDerivation<TData, TTarget, TParent> {
    return new SourceDerivationImpl(
      source,
      config.name,
      config.target,
      source.parent,
      source.context,
      config.extract,
    );
  },
});

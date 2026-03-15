/**
 * Loader - Units of execution that fetch data from external APIs.
 *
 * Three loader types:
 * - EntityLoader: Single ref → EntityInput<E>
 * - EntityLoaderBatched: Multiple refs → Batch<EntityInput<E>, Ref<E>>
 * - CollectionLoader: Parent ref → Page<EntityInput<TTarget>>
 *
 * @example
 * const UserLoader = Loader.entity({
 *   name: "acme:user:basic",
 *   context: AcmeContext,
 *   entity: AcmeUser,
 *   async load(ref, env) {
 *     const user = await env.ops.execute(GetUser, { id: ref.id });
 *     return EntityInput.create(ref, { name: user.name, email: user.email });
 *   }
 * });
 */

import type {Id} from "./brand.js";
import type {EntityDefAny} from "./entity-def.js";
import type {EntityInput} from "./entity-input.js";
import type {Ref} from "./ref.js";
import type {Page, PageRequest} from "./pagination.js";
import type {Batch} from "./batch.js";
import type {ContextDefAny} from "./context-def.js";
import type {LoaderEnv} from "./env.js";
import {ClassOf} from "./type-system-utils.js";
import {
  PaginatedSource,
  PaginatedSourceImpl,
  SingleSource,
  SingleSourceImpl,
  DerivedEntityLoader,
  DerivedEntityLoaderAny,
  DerivedEntityLoaderImpl,
  SourceName,
  SourcePage,
} from './source.js'
import {StaticTypeCompanion} from "./companion.js";

// ============================================================================
// Branded Types
// ============================================================================

/**
 * LoaderName - Soft-branded identifier for loaders.
 */
export type LoaderName = Id<"loader-name">;

// ============================================================================
// Loader Strategy
// ============================================================================

/**
 * LoaderStrategy determines when a loader runs.
 *
 * - "autoload": Runs automatically during sync (default)
 * - "manual": Only runs when explicitly requested
 */
export type LoaderStrategy = "autoload" | "manual";

// ============================================================================
// Field Assignment (for Resolver.for syntax)
// ============================================================================

/**
 * FieldAssignment - Returned by loader.field() for use in Resolver.for().
 */
export interface FieldAssignment<E extends EntityDefAny = EntityDefAny> {
  readonly loader: LoaderAny;
  readonly sourceField: string | undefined;
  readonly _entity?: E; // Phantom for type checking
}

// ============================================================================
// Base Loader Interface
// ============================================================================

/**
 * Common properties for all loader types.
 */
export interface BaseLoader<TContext extends ContextDefAny = ContextDefAny> {
  /** Loader kind discriminant */
  readonly kind: string;

  /** Unique name for this loader */
  readonly name: LoaderName;

  /** When to run: "autoload" (default) or "manual" */
  readonly strategy: LoaderStrategy;

  /** Context class (not instance) */
  readonly context: ClassOf<TContext>;

  /** Create a field assignment for use in Resolver.for(). */
  field(sourceField?: string): FieldAssignment;
}

// ============================================================================
// EntityLoader - Single ref, returns EntityInput
// ============================================================================

/**
 * EntityLoader<E, TContext> - Loads fields for a single entity.
 *
 * Returns EntityInput<E> containing the ref and loaded fields.
 */
export interface EntityLoader<
  E extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "entity";
  readonly entity: E;

  /**
   * Load fields for a single entity.
   */
  load(
    ref: Ref<E>,
    env: LoaderEnv<TContext>,
  ): Promise<EntityInput<E>>;

  /**
   * Create a field assignment for use in Resolver.for().
   */
  field(sourceField?: string): FieldAssignment<E>;
}

// ============================================================================
// BatchedEntityLoader - Multiple refs, returns Batch
// ============================================================================

/**
 * BatchedEntityLoader<E, TContext> - Loads fields for multiple entities.
 *
 * Returns Batch<EntityInput<E>, Ref<E>> for efficient bulk operations.
 */
export interface BatchedEntityLoader<
  E extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "entityBatched";
  readonly entity: E;

  /**
   * Load fields for multiple entities.
   */
  load(
    refs: readonly Ref<E>[],
    env: LoaderEnv<TContext>,
  ): Promise<Batch<EntityInput<E>, Ref<E>>>;

  /**
   * Create a field assignment for use in Resolver.for().
   */
  field(sourceField?: string): FieldAssignment<E>;
}

// ============================================================================
// CollectionLoader - Returns paginated refs
// ============================================================================

/**
 * CollectionLoader<E, TTarget, TContext> - Loads a collection field.
 *
 * Returns Page<EntityInput<TTarget>> for the collection items.
 * Collection loaders return EntityInputs (not bare Refs) because upstream
 * list APIs typically return entity data alongside references. Returning
 * EntityInputs allows fields to be populated immediately, avoiding
 * redundant per-entity fetches later.
 */
export interface CollectionLoader<
  E extends EntityDefAny = EntityDefAny,
  TTarget extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "collection";
  readonly entity: E;
  readonly target: TTarget;

  /**
   * Load a page of collection items.
   */
  load(
    ref: Ref<E>,
    page: PageRequest,
    env: LoaderEnv<TContext>,
  ): Promise<Page<EntityInput<TTarget>>>;

  /**
   * Create a field assignment for use in Resolver.for().
   */
  field(sourceField?: string): FieldAssignment<E>;
}

// ============================================================================
// Loader Union Types
// ============================================================================

/**
 * Any loader type for a given context.
 */
export type Loader<TContext extends ContextDefAny = ContextDefAny> =
  | EntityLoader<EntityDefAny, TContext>
  | BatchedEntityLoader<EntityDefAny, TContext>
  | CollectionLoader<EntityDefAny, EntityDefAny, TContext>;

/**
 * Any loader type (fully erased).
 * Includes DerivedEntityLoader (kind: "derivation") alongside the three loader variants.
 */
export type LoaderAny = Loader | DerivedEntityLoaderAny;

// ============================================================================
// Loader Implementation
// ============================================================================

export class EntityLoaderImpl<E extends EntityDefAny, TContext extends ContextDefAny>
  implements EntityLoader<E, TContext>
{
  readonly kind = "entity" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: ClassOf<TContext>,
    readonly entity: E,
    readonly strategy: LoaderStrategy,
    private loadFn: (
      ref: Ref<E>,
      env: LoaderEnv<TContext>,
    ) => Promise<EntityInput<E>>
  ) {}

  load(
    ref: Ref<E>,
    env: LoaderEnv<TContext>,
  ): Promise<EntityInput<E>> {
    return this.loadFn(ref, env);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}

export class BatchedEntityLoaderImpl<E extends EntityDefAny, TContext extends ContextDefAny>
  implements BatchedEntityLoader<E, TContext>
{
  readonly kind = "entityBatched" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: ClassOf<TContext>,
    readonly entity: E,
    readonly strategy: LoaderStrategy,
    private loadFn: (
      refs: readonly Ref<E>[],
      env: LoaderEnv<TContext>,
    ) => Promise<Batch<EntityInput<E>, Ref<E>>>
  ) {}

  load(
    refs: readonly Ref<E>[],
    env: LoaderEnv<TContext>,
  ): Promise<Batch<EntityInput<E>, Ref<E>>> {
    return this.loadFn(refs, env);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}

export class CollectionLoaderImpl<
  E extends EntityDefAny,
  TTarget extends EntityDefAny,
  TContext extends ContextDefAny
> implements CollectionLoader<E, TTarget, TContext>
{
  readonly kind = "collection" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: ClassOf<TContext>,
    readonly entity: E,
    readonly target: TTarget,
    readonly strategy: LoaderStrategy,
    private loadFn: (
      ref: Ref<E>,
      page: PageRequest,
      env: LoaderEnv<TContext>,
    ) => Promise<Page<EntityInput<TTarget>>>
  ) {}

  load(
    ref: Ref<E>,
    page: PageRequest,
    env: LoaderEnv<TContext>,
  ): Promise<Page<EntityInput<TTarget>>> {
    return this.loadFn(ref, page, env);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}


// ============================================================================
// Loader Static Companion
// ============================================================================

export const Loader = StaticTypeCompanion({
  /**
   * Create a paginated source.
   */
  paginatedSource<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      page: PageRequest,
      env: LoaderEnv<TContext>,
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
  singleSource<TData, TParent extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: SourceName;
    context: ClassOf<TContext>;
    parent: TParent;
    fetch: (
      ref: Ref<TParent>,
      env: LoaderEnv<TContext>,
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
   * Creates a DerivedEntityLoader that produces entities of the given type from the target input Source
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
  ): DerivedEntityLoader<TData, TTarget, TParent> {
    return new DerivedEntityLoaderImpl(
      source,
      config.name,
      config.target,
      source.parent,
      source.context,
      config.extract,
    );
  },

  /**
   * Create an entity loader (single ref).
   */
  entity<E extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: LoaderName;
    context: ClassOf<TContext>;
    entity: E;
    strategy?: LoaderStrategy;
    load: (
      ref: Ref<E>,
      env: LoaderEnv<TContext>,
    ) => Promise<EntityInput<E>>;
  }): EntityLoader<E, TContext> {
    return new EntityLoaderImpl(
      config.name,
      config.context,
      config.entity,
      config.strategy ?? "autoload",
      config.load,
    );
  },

  /**
   * Create a batched entity loader (multiple refs).
   */
  entityBatched<E extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: LoaderName;
    context: ClassOf<TContext>;
    entity: E;
    strategy?: LoaderStrategy;
    load: (
      refs: readonly Ref<E>[],
      env: LoaderEnv<TContext>,
    ) => Promise<Batch<EntityInput<E>, Ref<E>>>;
  }): BatchedEntityLoader<E, TContext> {
    return new BatchedEntityLoaderImpl(
      config.name,
      config.context,
      config.entity,
      config.strategy ?? "autoload",
      config.load,
    );
  },

  /**
   * Create a collection loader (paginated entity inputs).
   */
  collection<
    E extends EntityDefAny,
    TTarget extends EntityDefAny,
    TContext extends ContextDefAny
  >(config: {
    name: LoaderName;
    context: ClassOf<TContext>;
    entity: E;
    target: TTarget;
    strategy?: LoaderStrategy;
    load: (
      ref: Ref<E>,
      page: PageRequest,
      env: LoaderEnv<TContext>,
    ) => Promise<Page<EntityInput<TTarget>>>;
  }): CollectionLoader<E, TTarget, TContext> {
    return new CollectionLoaderImpl(
      config.name,
      config.context,
      config.entity,
      config.target,
      config.strategy ?? "autoload",
      config.load,
    );
  },
});

/**
 * DefaultTaskRunner - Concrete task execution for local/dev environments.
 *
 * Handles loader dispatch, engine.store, and syncMeta bookkeeping.
 */

import type {
  CollectionLoader,
  ContextValuesAny,
  Engine,
  EntityDefAny,
  EntityType,
  FlowController,
  LoaderAny,
  LoaderName,
  OperationKind,
  RefAny,
  RefKey,
  SourceDerivationAny,
  SyncMeta,
} from '@max/core'
import { PageRequest, Projection, Ref as RefStatic } from '@max/core'

import type {
  ExecutionRegistry,
  TaskChildTemplate,
  TaskPayload,
  TaskProgress,
  TaskRunner,
  TaskRunResult,
} from '@max/execution'
import {
  ErrLoaderDepsNotSupported,
  ErrNoCollectionLoader,
  ErrNoDepsAvailable,
  ErrNoResolver,
  ErrUnknownEntityType,
} from '@max/execution'

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 100;

// ============================================================================
// Config
// ============================================================================

export interface DefaultTaskRunnerConfig {
  engine: Engine
  syncMeta: SyncMeta
  registry: ExecutionRegistry
  flowController: FlowController
  contextProvider: () => Promise<ContextValuesAny>
}

// ============================================================================
// DefaultTaskRunner
// ============================================================================

export class DefaultTaskRunner implements TaskRunner {
  private engine: Engine
  private syncMeta: SyncMeta
  private registry: ExecutionRegistry
  private flowController: FlowController
  private contextProvider: () => Promise<ContextValuesAny>

  constructor(config: DefaultTaskRunnerConfig) {
    this.engine = config.engine
    this.syncMeta = config.syncMeta
    this.registry = config.registry
    this.flowController = config.flowController
    this.contextProvider = config.contextProvider
  }

  async execute(task: { readonly payload: TaskPayload }): Promise<TaskRunResult> {
    switch (task.payload.kind) {
      case 'sync-step':
        return this.executeSyncStep(task.payload)
      case 'load-fields':
        return this.executeLoadFields(task.payload)
      case 'load-collection':
        return this.executeLoadCollection(task.payload)
      case 'sync-group':
        // Synthetic group tasks don't execute — they start in awaiting_children
        return {}
    }
  }

  // ============================================================================
  // Sync-step execution
  // ============================================================================

  private async executeSyncStep(
    payload: TaskPayload & { kind: 'sync-step' }
  ): Promise<TaskRunResult> {
    const { target, operation } = payload.step
    const entityDef = this.registry.getEntity(target.entityType)
    if (!entityDef) throw ErrUnknownEntityType.create({ entityType: target.entityType })

    if (target.kind === 'forRoot' || target.kind === 'forOne') {
      // Single ref: execute directly, no children needed
      if (operation.kind === 'loadFields') {
        await this.processLoadFieldsForRef(entityDef, target.refKey!, operation.fields!)
      } else if (operation.kind === 'loadCollection') {
        return this.executeLoadCollectionForRef(entityDef, target.refKey!, operation.field!)
      }
      return {}
    }

    // ForAll: paginated execution
    if (operation.kind === 'loadFields') {
      return this.executeForAllLoadFields(entityDef, target, operation.fields!)
    } else if (operation.kind === 'loadCollection') {
      return this.executeForAllLoadCollection(entityDef, target, operation.field!)
    }

    return {}
  }

  // ============================================================================
  // ForAll: paginated over Max's store
  // ============================================================================

  /**
   * ForAll loadFields: query a page of refs, run loaders, spawn continuation.
   */
  private async executeForAllLoadFields(
    entityDef: EntityDefAny,
    target: { kind: string; entityType: EntityType },
    fields: readonly string[],
    cursor?: string
  ): Promise<TaskRunResult> {
    const page = await this.engine.loadPage(
      entityDef,
      Projection.refs,
      PageRequest.from({ cursor, limit: PAGE_SIZE })
    )
    if (page.items.length === 0) return {}

    // Process this page inline (preserves batching for batched loaders)
    await this.processLoadFieldsForRefs(entityDef, target, fields, page.items)

    const progress: TaskProgress = {
      entityType: target.entityType,
      operation: 'load-fields',
      count: page.items.length,
    }

    if (page.hasMore) {
      return {
        progress,
        children: [
          {
            state: 'pending',
            payload: {
              kind: 'load-fields',
              entityType: target.entityType,
              refKeys: [],
              fields,
              cursor: page.cursor,
            },
          },
        ],
      }
    }

    return { progress }
  }

  /**
   * ForAll loadCollection: paginated over refs, spawn a collection load per ref.
   */
  private async executeForAllLoadCollection(
    entityDef: EntityDefAny,
    target: { kind: string; entityType: EntityType },
    field: string,
    cursor?: string
  ): Promise<TaskRunResult> {
    const page = await this.engine.loadPage(
      entityDef,
      Projection.refs,
      PageRequest.from({ cursor, limit: PAGE_SIZE })
    )
    if (page.items.length === 0) return {}

    // Resolve target entity type from the collection loader or derivation
    const resolver = this.registry.getResolver(target.entityType)
    if (!resolver) throw ErrNoResolver.create({ entityType: target.entityType })
    const loader = resolver.getLoaderForField(field)
    if (!loader || (loader.kind !== 'collection' && loader.kind !== 'derivation')) {
      throw ErrNoCollectionLoader.create({ entityType: target.entityType, field })
    }

    const targetEntityType: EntityType = loader.target.name

    const children: TaskChildTemplate[] = []

    // One collection-load child per ref
    for (const ref of page.items) {
      children.push({
        state: 'pending',
        payload: {
          kind: 'load-collection',
          entityType: target.entityType,
          targetEntityType,
          refKey: ref.toKey(),
          field,
        },
      })
    }

    // Continuation for next page of refs
    if (page.hasMore) {
      children.push({
        state: 'pending',
        payload: {
          kind: 'load-fields', // Reuse load-fields with cursor for ref pagination
          entityType: target.entityType,
          refKeys: [],
          fields: [],
          cursor: page.cursor,
        },
      })
    }

    return { children }
  }

  // ============================================================================
  // Load fields execution
  // ============================================================================

  private async processLoadFieldsForRef(
    entityDef: EntityDefAny,
    refKey: RefKey,
    fields: readonly string[]
  ): Promise<void> {
    const ref = RefStatic.fromKey(entityDef, refKey)
    await this.processLoadFieldsForRefs(entityDef, { entityType: entityDef.name }, fields, [ref])
  }

  private async processLoadFieldsForRefs(
    entityDef: EntityDefAny,
    target: { entityType: EntityType },
    fields: readonly string[],
    refs: readonly RefAny[]
  ): Promise<void> {
    const resolver = this.registry.getResolver(target.entityType)
    if (!resolver) throw ErrNoResolver.create({ entityType: target.entityType })

    // Group fields by loader
    const loaderFields = new Map<LoaderAny, string[]>()
    for (const field of fields) {
      const loader = resolver.getLoaderForField(field)
      if (!loader) continue
      const existing = loaderFields.get(loader) ?? []
      existing.push(field)
      loaderFields.set(loader, existing)
    }

    const ctx = await this.contextProvider()

    for (const [loader, fieldNames] of loaderFields) {
      this.assertNoDeps(loader)
      const token = await this.flowController.acquire(getOperationForLoaderName(loader.name))
      try {
        if (loader.kind === 'entityBatched') {
          const batch = await loader.load(refs, ctx, emptyDeps)
          for (const ref of refs) {
            const input = batch.get(ref)
            if (input) {
              await this.engine.store(input)
              await this.syncMeta.recordFieldSync(ref, fieldNames, new Date())
            }
          }
        } else if (loader.kind === 'entity') {
          for (const ref of refs) {
            const input = await loader.load(ref, ctx, emptyDeps)
            await this.engine.store(input)
            await this.syncMeta.recordFieldSync(ref, fieldNames, new Date())
          }
        } else if (loader.kind === 'derivation' && loader.source.kind === 'single') {
          for (const ref of refs) {
            const data = await loader.source.fetch(ref, ctx)
            for (const d of loader.source.derivations) {
              const items = d.extract(data)
              for (const input of items) {
                // FIXME: DISCUSSION: I think we need a bulk store primitive
                await this.engine.store(input)
                const extractedFields = Object.keys(input.fields ?? {})
                if (extractedFields.length > 0) {
                  await this.syncMeta.recordFieldSync(input.ref, extractedFields, new Date())
                }
              }
            }
          }
        }
      } finally {
        this.flowController.release(token)
      }
    }
  }

  /**
   * Execute a load-fields task (child task for ForAll continuations).
   */
  private async executeLoadFields(
    payload: TaskPayload & { kind: 'load-fields' }
  ): Promise<TaskRunResult> {
    const { entityType, refKeys, fields, cursor } = payload
    const entityDef = this.registry.getEntity(entityType)
    if (!entityDef) throw ErrUnknownEntityType.create({ entityType })
    // FIXME: We should know our connector here!
    // Ah. The issue is that the task runner doesn't have a _scope_.

    if (refKeys.length > 0) {
      // Direct ref-based load (ForRoot/ForOne style)
      const refs = refKeys.map((key) => RefStatic.fromKey(entityDef, key))
      await this.processLoadFieldsForRefs(entityDef, { entityType }, fields, refs)
      return {}
    }

    // ForAll continuation: re-query with cursor offset
    if (cursor !== undefined) {
      return this.executeForAllLoadFields(entityDef, { kind: 'forAll', entityType }, fields, cursor)
    }

    return {}
  }

  // ============================================================================
  // Load collection execution
  // ============================================================================

  /**
   * Execute collection loading for a single ref.
   * Returns children if there's a pagination continuation.
   */
  private async executeLoadCollectionForRef(
    entityDef: EntityDefAny,
    refKey: RefKey,
    field: string,
    cursor?: string
  ): Promise<TaskRunResult> {
    const resolver = this.registry.getResolver(entityDef.name)
    if (!resolver) throw ErrNoResolver.create({ entityType: entityDef.name })

    const loader = resolver.getLoaderForField(field)

    // Source-backed derivation from a paginated source
    if (loader && loader.kind === 'derivation') {
      return this.executeSourcePaginatedCollection(
        entityDef, refKey, field, loader, cursor
      )
    }

    if (!loader || loader.kind !== 'collection') {
      throw ErrNoCollectionLoader.create({ entityType: entityDef.name, field })
    }

    this.assertNoDeps(loader)
    const collectionLoader = loader
    const ref = RefStatic.fromKey(entityDef, refKey)
    const ctx = await this.contextProvider()
    const token = await this.flowController.acquire(getOperationForLoaderName(loader.name))

    try {
      const page = await collectionLoader.load(
        ref,
        PageRequest.from({ cursor, limit: PAGE_SIZE }),
        ctx,
        emptyDeps
      )

      for (const input of page.items) {
        await this.engine.store(input)
        const fieldNames = Object.keys(input.fields ?? {})
        if (fieldNames.length > 0) {
          await this.syncMeta.recordFieldSync(input.ref, fieldNames, new Date())
        }
      }

      const targetEntityType = collectionLoader.target.name
      const progress: TaskProgress = {
        entityType: targetEntityType,
        operation: 'load-collection',
        count: page.items.length,
      }

      if (page.hasMore && page.cursor) {
        return {
          progress,
          children: [
            {
              state: 'pending',
              payload: {
                kind: 'load-collection',
                entityType: entityDef.name,
                targetEntityType,
                refKey,
                field,
                cursor: page.cursor,
              },
            },
          ],
        }
      }

      return { progress }
    } finally {
      this.flowController.release(token)
    }
  }

  /**
   * Execute a source-backed paginated derivation for a single ref.
   * Fetches the source once and runs ALL co-derivations on each page.
   */
  private async executeSourcePaginatedCollection(
    entityDef: EntityDefAny,
    refKey: RefKey,
    field: string,
    derivation: SourceDerivationAny,
    cursor?: string,
  ): Promise<TaskRunResult> {
    const source = derivation.source
    if (source.kind !== 'paginated') {
      throw ErrNoCollectionLoader.create({ entityType: entityDef.name, field })
    }

    this.assertNoDeps(derivation)
    const ref = RefStatic.fromKey(entityDef, refKey)
    const ctx = await this.contextProvider()
    const token = await this.flowController.acquire(getOperationForLoaderName(derivation.name))

    try {
      const sourcePage = await source.fetch(
        ref,
        PageRequest.from({ cursor, limit: PAGE_SIZE }),
        ctx,
      )

      let triggerCount = 0

      // Run ALL derivations from this source - one fetch, multiple entity types
      for (const d of source.derivations) {
        const items = d.extract(sourcePage.data)
        for (const input of items) {
          await this.engine.store(input)
          const fieldNames = Object.keys(input.fields ?? {})
          if (fieldNames.length > 0) {
            await this.syncMeta.recordFieldSync(input.ref, fieldNames, new Date())
          }
        }
        if (d === derivation) {
          triggerCount = items.length
        }
      }

      const targetEntityType = derivation.target.name
      const progress: TaskProgress = {
        entityType: targetEntityType,
        operation: 'load-collection',
        count: triggerCount,
      }

      if (sourcePage.hasMore && sourcePage.cursor) {
        return {
          progress,
          children: [
            {
              state: 'pending',
              payload: {
                kind: 'load-collection',
                entityType: entityDef.name,
                targetEntityType,
                refKey,
                field,
                cursor: sourcePage.cursor,
              },
            },
          ],
        }
      }

      return { progress }
    } finally {
      this.flowController.release(token)
    }
  }

  /**
   * Execute a load-collection task (child task from pagination or ForAll expansion).
   */
  private async executeLoadCollection(
    payload: TaskPayload & { kind: 'load-collection' }
  ): Promise<TaskRunResult> {
    const { entityType, refKey, field, cursor } = payload
    const entityDef = this.registry.getEntity(entityType)
    if (!entityDef) throw ErrUnknownEntityType.create({ entityType })
    // FIXME: We should know our connector here!
    // Ah. The issue is that the task runner doesn't have a _scope_.

    return this.executeLoadCollectionForRef(entityDef, refKey, field, cursor)
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private assertNoDeps(loader: LoaderAny): void {
    if (loader.dependsOn.length > 0) {
      throw ErrLoaderDepsNotSupported.create({ loaderName: loader.name })
    }
  }
}

// ============================================================================
// Empty deps stub
// ============================================================================

const emptyDeps = {
  get: () => undefined,
  getOrThrow: (loader: any) => { throw ErrNoDepsAvailable.create({ loaderName: loader.name }); },
  has: () => false,
};


/** This is syntactic signposting only - we haven't really designed "operations" yet - for now we just use the loader's as it is */
function getOperationForLoaderName(loaderName: LoaderName): OperationKind {
  return loaderName as OperationKind
}

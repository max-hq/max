/**
 * DefaultTaskRunner - Concrete task execution for local/dev environments.
 *
 * Handles loader dispatch, engine.store, and syncMeta bookkeeping.
 */

import {
  ContextValuesAny,
  Engine,
  EntityDefAny,
  EntityInputAny,
  EntityType,
  FlowController,
  LoaderAny,
  LoaderName,
  OperationKind,
  RefAny,
  RefKey,
  DerivedEntityLoaderAny,
  SyncMeta,
  LazyX,
  Env,
} from '@max/core'
import { LoaderEnv, PageRequest, Projection, Ref } from '@max/core'
import {
  DefaultOperationDispatcher,
  type OperationDispatcher,
  StandardLoaderEnv,
} from '@max/execution'

import type {
  ExecutionRegistry,
  ForAllTarget,
  TaskChildTemplate,
  TaskPayload,
  TaskProgress,
  TaskRunner,
  TaskRunResult,
} from '@max/execution'
import {
  ErrNoCollectionLoader,
  ErrNoResolver,
  ErrUnknownEntityType,
} from '@max/execution'

// ============================================================================
// Tuning
// ============================================================================

export interface ExecutionTuning {
  /** Page size for iterating over refs in the engine (ForAll operations). */
  refPageSize: number
  /** Page size hint for connector collection loads. */
  connectorPageSize: number
}

const DEFAULT_TUNING: ExecutionTuning = {
  refPageSize: 500,
  connectorPageSize: 100,
}

// ============================================================================
// Config
// ============================================================================

export interface DefaultTaskRunnerConfig {
  engine: Engine
  syncMeta: SyncMeta
  registry: ExecutionRegistry
  flowController: FlowController
  contextProvider: () => Promise<ContextValuesAny>
  dispatcher?: OperationDispatcher
  /**
   * Execution tuning parameters. Static at construction time for now.
   * Future: make dynamic so an adaptive controller can adjust at runtime.
   */
  tuning?: Partial<ExecutionTuning>
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
  private dispatcher: OperationDispatcher
  private tuning: ExecutionTuning

  constructor(config: DefaultTaskRunnerConfig) {
    this.engine = config.engine
    this.syncMeta = config.syncMeta
    this.registry = config.registry
    this.flowController = config.flowController
    this.contextProvider = config.contextProvider
    this.dispatcher = config.dispatcher ?? new DefaultOperationDispatcher()
    this.tuning = { ...DEFAULT_TUNING, ...config.tuning }
  }

  private builtEnv = LazyX.once(async (): Promise<LoaderEnv> => {
    const ctx = await this.contextProvider()
    return new StandardLoaderEnv(ctx, this.dispatcher)
  })


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
    const { target, operation } = payload
    const entityDef = this.registry.getEntity(target.entityType)
    if (!entityDef) throw ErrUnknownEntityType.create({ entityType: target.entityType })

    if (target.kind === 'forRoot' || target.kind === 'forOne') {
      // Single ref: execute directly, no children needed
      if (operation.kind === 'loadFields') {
        await this.processLoadFieldsForRef(entityDef, target.refKey, operation.fields!)
      } else if (operation.kind === 'loadCollection') {
        return this.executeLoadCollectionForRef(entityDef, target.refKey, operation.field!)
      }
      return {}
    }

    // ForAll: paginated execution
    if (operation.kind === 'loadFields') {
      return this.executeForAllLoadFields(entityDef, payload)
    } else if (operation.kind === 'loadCollection') {
      return this.executeForAllLoadCollection(entityDef, payload)
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
    payload: TaskPayload & { kind: 'sync-step' },
  ): Promise<TaskRunResult> {
    const target = payload.target as ForAllTarget
    const { operation } = payload
    const page = await this.engine.loadPage(
      entityDef,
      Projection.refs,
      PageRequest.create({ cursor: target.cursor, limit: this.tuning.refPageSize })
    )
    if (page.items.length === 0) return {}

    // Process this page inline (preserves batching for batched loaders)
    await this.processLoadFieldsForRefs(entityDef, target, operation.fields!, page.items)

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
              kind: 'sync-step',
              target: { ...target, cursor: page.cursor },
              operation,
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
    payload: TaskPayload & { kind: 'sync-step' },
  ): Promise<TaskRunResult> {
    const target = payload.target as ForAllTarget
    const { operation } = payload
    const page = await this.engine.loadPage(
      entityDef,
      Projection.refs,
      PageRequest.create({ cursor: target.cursor, limit: this.tuning.refPageSize })
    )
    if (page.items.length === 0) return {}

    // Resolve target entity type from the collection loader or derivation
    const resolver = this.registry.getResolver(target.entityType)
    if (!resolver) throw ErrNoResolver.create({ entityType: target.entityType })
    const field = operation.field!
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
          kind: 'sync-step',
          target: { ...target, cursor: page.cursor },
          operation,
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
    const ref = Ref.fromKey(entityDef, refKey)
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

    const env = await this.builtEnv.get

    for (const [loader, fieldNames] of loaderFields) {
      const token = await this.flowController.acquire(getOperationForLoaderName(loader.name))
      try {
        if (loader.kind === 'entityBatched') {
          const batch = await loader.load(refs, env)
          const inputs: EntityInputAny[] = []
          const syncEntries: { ref: RefAny; field: string; timestamp: Date }[] = []
          const now = new Date()
          for (const ref of refs) {
            const input = batch.get(ref)
            if (input) {
              inputs.push(input)
              for (const f of fieldNames) {
                syncEntries.push({ ref, field: f, timestamp: now })
              }
            }
          }
          await this.flushBatch(inputs, syncEntries)
        } else if (loader.kind === 'entity') {
          const inputs: EntityInputAny[] = []
          const syncEntries: { ref: RefAny; field: string; timestamp: Date }[] = []
          const now = new Date()
          for (const ref of refs) {
            const input = await loader.load(ref, env)
            inputs.push(input)
            for (const f of fieldNames) {
              syncEntries.push({ ref, field: f, timestamp: now })
            }
          }
          await this.flushBatch(inputs, syncEntries)
        } else if (loader.kind === 'derivation' && loader.source.kind === 'single') {
          const coDerivations = this.registry.getCoDerivations(loader)
          for (const ref of refs) {
            const data = await loader.source.fetch(ref, env)
            const inputs: EntityInputAny[] = []
            const syncEntries: { ref: RefAny; field: string; timestamp: Date }[] = []
            const now = new Date()
            for (const d of coDerivations) {
              const items = d.extract(data)
              for (const input of items) {
                inputs.push(input)
                for (const f of Object.keys(input.fields ?? {})) {
                  syncEntries.push({ ref: input.ref, field: f, timestamp: now })
                }
              }
            }
            await this.flushBatch(inputs, syncEntries)
          }
        }
      } finally {
        this.flowController.release(token)
      }
    }
  }

  /**
   * Execute a load-fields task for specific refs.
   */
  private async executeLoadFields(
    payload: TaskPayload & { kind: 'load-fields' }
  ): Promise<TaskRunResult> {
    const { entityType, refKeys, fields } = payload
    const entityDef = this.registry.getEntity(entityType)
    if (!entityDef) throw ErrUnknownEntityType.create({ entityType })

    if (refKeys.length > 0) {
      const refs = refKeys.map((key) => Ref.fromKey(entityDef, key))
      await this.processLoadFieldsForRefs(entityDef, { entityType }, fields, refs)
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

    const collectionLoader = loader
    const ref = Ref.fromKey(entityDef, refKey)
    const env = await this.builtEnv.get
    const token = await this.flowController.acquire(getOperationForLoaderName(loader.name))

    try {
      const page = await collectionLoader.load(
        ref,
        PageRequest.create({ cursor, limit: this.tuning.connectorPageSize }),
        env,
      )

      const inputs: EntityInputAny[] = []
      const syncEntries: { ref: RefAny; field: string; timestamp: Date }[] = []
      const now = new Date()
      for (const input of page.items) {
        inputs.push(input)
        for (const f of Object.keys(input.fields ?? {})) {
          syncEntries.push({ ref: input.ref, field: f, timestamp: now })
        }
      }
      await this.flushBatch(inputs, syncEntries)

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
    derivation: DerivedEntityLoaderAny,
    cursor?: string,
  ): Promise<TaskRunResult> {
    const source = derivation.source
    if (source.kind !== 'paginated') {
      throw ErrNoCollectionLoader.create({ entityType: entityDef.name, field })
    }

    const ref = Ref.fromKey(entityDef, refKey)
    const env = await this.builtEnv.get
    const token = await this.flowController.acquire(getOperationForLoaderName(derivation.name))

    try {
      const sourcePage = await source.fetch(
        ref,
        PageRequest.create({ cursor, limit: this.tuning.connectorPageSize }),
        env,
      )

      let triggerCount = 0

      // Run ALL co-derivations from this source - one fetch, multiple entity types
      const coDerivations = this.registry.getCoDerivations(derivation)
      const inputs: EntityInputAny[] = []
      const syncEntries: { ref: RefAny; field: string; timestamp: Date }[] = []
      const now = new Date()
      for (const d of coDerivations) {
        const items = d.extract(sourcePage.data)
        for (const input of items) {
          inputs.push(input)
          for (const f of Object.keys(input.fields ?? {})) {
            syncEntries.push({ ref: input.ref, field: f, timestamp: now })
          }
        }
        if (d === derivation) {
          triggerCount = items.length
        }
      }
      await this.flushBatch(inputs, syncEntries)

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
  // Batch helpers
  // ============================================================================

  private async flushBatch(
    inputs: EntityInputAny[],
    syncEntries: ReadonlyArray<{ ref: RefAny; field: string; timestamp: Date }>
  ): Promise<void> {
    if (inputs.length === 0) return
    await this.engine.storeMany(inputs)
    await this.syncMeta.recordFieldSyncBatch(syncEntries)
  }

}

/**
 * Maps a loader name to an OperationKind for flow control.
 *
 * Temporary shim: loaders predate the operations framework and don't have
 * an Operation.name yet. Once loaders dispatch through operations, this
 * goes away and the operation's own name is used directly.
 */
function getOperationForLoaderName(loaderName: LoaderName): OperationKind {
  return loaderName as OperationKind
}

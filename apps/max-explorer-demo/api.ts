/**
 * API route handlers for the Max Explorer.
 *
 * All handlers are pure functions that take a MaxContext and return Responses.
 */

import { type Schema, type EntityDefAny, WhereClause, PageRequest, Projection } from '@max/core'
import { SqliteEngine } from '@max/storage-sqlite'
import type { InstallationClient } from '@max/federation'
import type { GlobalMax } from '@max/federation'
import { parseFilter, lowerToWhereClause } from '@max/query-parser'

// ============================================================================
// Context — shared state passed to all handlers
// ============================================================================

export interface MaxContext {
  globalMax: GlobalMax
  workspaces: Array<{ id: string; name: string }>
}

// Installation clients are started lazily and cached here.
const clientCache = new Map<string, InstallationClient>()

async function getClient(ctx: MaxContext, workspaceId: string, installationId: string): Promise<InstallationClient> {
  if (clientCache.has(installationId)) return clientCache.get(installationId)!
  const ws = ctx.globalMax.workspace(workspaceId)
  const client = ws.installation(installationId)
  await client.start()
  clientCache.set(installationId, client)
  return client
}

// ============================================================================
// Schema serialization
// ============================================================================

function serializeSchema(schema: Schema) {
  return {
    namespace: schema.namespace,
    entities: schema.entities.map(serializeEntity),
    relationships: schema.relationships.map(r => ({
      from: r.from, field: r.field, to: r.to, cardinality: r.cardinality,
    })),
  }
}

function serializeEntity(entity: EntityDefAny) {
  const fields: Record<string, { kind: string; type?: string; target?: string }> = {}
  for (const [name, def] of Object.entries(entity.fields)) {
    const field = def as { kind: string; type?: string; target?: EntityDefAny }
    if (field.kind === 'scalar') fields[name] = { kind: 'scalar', type: field.type }
    else if (field.kind === 'ref') fields[name] = { kind: 'ref', target: field.target?.name }
    else if (field.kind === 'collection') fields[name] = { kind: 'collection', target: field.target?.name }
  }
  return { name: entity.name, fields }
}

// ============================================================================
// Route handlers
// ============================================================================

export function handleListWorkspaces(ctx: MaxContext): Response {
  return Response.json(ctx.workspaces)
}

export async function handleWorkspaceDetail(ctx: MaxContext, workspaceId: string): Promise<Response> {
  const ws = ctx.globalMax.workspace(workspaceId)
  const info = ctx.workspaces.find(w => w.id === workspaceId)
  const rawInstallations = await ws.listInstallations()

  const installations = await Promise.all(rawInstallations.map(async (inst) => {
    try {
      const client = await getClient(ctx, workspaceId, inst.id)

      let dbPath: string | null = null
      if (client.engine instanceof SqliteEngine) {
        dbPath = client.engine.db.filename
      }

      let schema = null
      try { schema = serializeSchema(await client.schema()) } catch {}

      return { id: inst.id, name: inst.name, connector: inst.connector, dbPath, schema }
    } catch (err) {
      console.warn(`  Failed to start ${inst.name}:`, err)
      return { id: inst.id, name: inst.name, connector: inst.connector, dbPath: null, schema: null }
    }
  }))

  return Response.json({ id: workspaceId, name: info?.name ?? workspaceId, installations })
}

export async function handleEntityQuery(
  ctx: MaxContext,
  workspaceId: string,
  installationId: string,
  entityType: string,
  params: URLSearchParams,
): Promise<Response> {
  let client: InstallationClient
  try {
    client = await getClient(ctx, workspaceId, installationId)
  } catch {
    return Response.json({ error: 'Installation not found' }, { status: 404 })
  }

  let schema: Schema
  try { schema = await client.schema() } catch {
    return Response.json({ error: 'Schema unavailable' }, { status: 500 })
  }

  const entityDef = schema.getDefinition(entityType)
  if (!entityDef) return Response.json({ error: `Entity "${entityType}" not found` }, { status: 404 })

  const limit = Math.min(parseInt(params.get('limit') ?? '50', 10), 200)
  const cursor = params.get('cursor') ?? undefined
  const filterStr = params.get('filter') ?? ''

  let filters: WhereClause = WhereClause.empty
  if (filterStr) {
    try {
      filters = lowerToWhereClause(parseFilter(filterStr))
    } catch (err) {
      return Response.json({ parseError: String(err) })
    }
  }

  try {
    const page = await client.engine.query(
      { def: entityDef, filters, projection: Projection.all },
      PageRequest.create({ limit, cursor }),
    )

    const rows = page.items.map(result => {
      const row: Record<string, unknown> = { _id: result.ref.id }
      for (const [key, val] of Object.entries(result.fields)) {
        if (val && typeof val === 'object' && 'id' in val) row[key] = (val as { id: string }).id
        else if (val instanceof Date) row[key] = val.toISOString()
        else row[key] = val
      }
      return row
    })

    return Response.json({ rows, hasMore: page.hasMore, cursor: page.cursor ?? null })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

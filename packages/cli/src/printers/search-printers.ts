/**
 * Printers for search command output.
 *
 * Three output modes: text (human-readable table), json, ndjson.
 * All printers respect optional field selection — when selectedFields
 * is provided, only those fields appear in output.
 */

import type { EntityDefAny, EntityResult, Page } from '@max/core'
import { Printer } from '@max/core'

export interface SearchView {
  entityType: string
  page: Page<EntityResult<EntityDefAny, string>>
  selectedFields?: string[]
  streaming?: boolean
  isFirstPage?: boolean
}

/** Pick fields to display: user selection if provided, otherwise all loaded fields. */
function resolveFields(view: SearchView): string[] {
  if (view.selectedFields) return view.selectedFields
  const fieldSet = new Set<string>()
  for (const item of view.page.items) {
    for (const f of item.loadedFields()) fieldSet.add(f)
  }
  return Array.from(fieldSet)
}

/** Convert an entity result to a plain object filtered by fields (including meta fields). */
function pickFields(item: EntityResult<EntityDefAny, string>, fields: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const f of fields) {
    const val = item.maybeGet(f)
    if (val !== undefined) picked[f] = val
  }
  return picked
}

// ============================================================================
// Text — tabular output with pagination hint
// ============================================================================

const MAX_COL_WIDTH = 80
const WIDTH_SAMPLE_SIZE = 20

/** Truncate a string to maxLen, adding ellipsis if needed. */
function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value
  let end = maxLen - 1
  // Don't split a surrogate pair — step back if we'd land between them
  if (end > 0 && end < value.length) {
    const code = value.charCodeAt(end - 1)
    if (code >= 0xD800 && code <= 0xDBFF) end--
  }
  return value.slice(0, end) + '…'
}

/** Stringify a single entity result into an array of cell values for the given fields. */
function toRow(item: EntityResult<EntityDefAny, string>, fields: string[]): string[] {
  const obj = pickFields(item, fields)
  return fields.map(f => String(obj[f] ?? ''))
}

/**
 * Determine column widths from a sample batch. Only the first
 * WIDTH_SAMPLE_SIZE items are inspected — this keeps the cost bounded
 * and makes the approach compatible with future streaming.
 */
function sampleWidths(
  fields: string[],
  items: readonly EntityResult<EntityDefAny, string>[],
): number[] {
  const widths = fields.map(h => h.length)
  const end = Math.min(items.length, WIDTH_SAMPLE_SIZE)
  for (let r = 0; r < end; r++) {
    const row = toRow(items[r], fields)
    for (let c = 0; c < fields.length; c++) {
      if (row[c].length > widths[c]) widths[c] = row[c].length
    }
  }
  // Cap every column
  for (let c = 0; c < widths.length; c++) {
    if (widths[c] > MAX_COL_WIDTH) widths[c] = MAX_COL_WIDTH
  }
  return widths
}

export const SearchTextPrinter = Printer.define<SearchView>((view, fmt) => {
  const { page, entityType } = view
  const lines: string[] = []

  // Header - only on first page
  if (view.isFirstPage !== false) {
    if (view.streaming) {
      lines.push(fmt.underline(entityType))
    } else {
      const count = page.items.length
      const more = page.hasMore ? ', more available' : ''
      lines.push(`${fmt.underline(entityType)}: ${count} result${count !== 1 ? 's' : ''}${more}`)
    }
    lines.push('')
  }

  if (page.items.length === 0) {
    if (view.isFirstPage !== false) lines.push('  No results.')
    return Printer.lines(lines)
  }

  const fields = resolveFields(view)
  const widths = sampleWidths(fields, page.items)

  // Column headers - only on first page
  if (view.isFirstPage !== false) {
    lines.push('  ' + fields.map((h, i) => fmt.dim(h.padEnd(widths[i]))).join('  '))
  }

  // Data rows - each item is stringified and truncated independently
  for (const item of page.items) {
    const row = toRow(item, fields)
    lines.push('  ' + row.map((c, i) => truncate(c, widths[i]).padEnd(widths[i])).join('  '))
  }

  // Pagination hint - suppress when streaming
  if (!view.streaming && page.hasMore && page.cursor) {
    lines.push('')
    lines.push(fmt.dim(`Next page: --after ${page.cursor}`))
    lines.push(fmt.dim(`All results: --all`))
  }

  return Printer.lines(lines)
})

// ============================================================================
// JSON — single object with pagination metadata
// ============================================================================

export const SearchJsonPrinter = Printer.define<SearchView>((view, _fmt) => {
  const fields = resolveFields(view)
  const data = view.page.items.map(item => pickFields(item, fields))
  const result: Record<string, unknown> = {
    type: view.entityType,
    data,
    hasMore: view.page.hasMore,
  }
  if (view.page.cursor) result.cursor = view.page.cursor
  return JSON.stringify(result, null, 2)
})

// ============================================================================
// NDJSON — one line per entity, metadata as final line
// ============================================================================

export const SearchNdjsonPrinter = Printer.define<SearchView>((view, _fmt) => {
  const fields = resolveFields(view)
  const lines: string[] = []
  for (const item of view.page.items) {
    lines.push(JSON.stringify(pickFields(item, fields)))
  }
  // Emit _meta only in single-page mode (not streaming).
  // When streaming (--all), the stream ending IS the end signal.
  if (!view.streaming) {
    const meta: Record<string, unknown> = {
      type: view.entityType,
      hasMore: view.page.hasMore,
      cursor: view.page.cursor,
    }
    if (view.page.hasMore) {
      meta.hint = 'Use --all to stream all results, or --after <cursor> for next page'
    }
    lines.push(JSON.stringify({ _meta: meta }))
  }
  return lines.join('\n')
})

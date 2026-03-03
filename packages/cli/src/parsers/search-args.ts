/**
 * Helpers for parsing search command option values.
 */

import { MetaField } from '@max/core'
import type { EntityDefAny } from '@max/core'
import { ErrUnknownFieldGroup } from '../errors.js'

/** Parse "field:dir" ordering string. */
export function parseOrderBy(input: string): { field: string; dir: 'asc' | 'desc' } {
  const [field, dir] = input.split(':')
  const direction = dir?.toLowerCase()
  return {
    field,
    dir: direction === 'desc' ? 'desc' : 'asc',
  }
}

/**
 * Group selectors — dot-prefixed keywords that expand to sets of fields.
 *
 *   .props  - all schema-defined property fields
 *   .meta   - all meta fields (_id, _ref, ...)
 *   .all    - .meta + .props
 */
const GROUP_PREFIX = '.'

const FIELD_GROUPS: Record<string, (def: EntityDefAny) => string[]> = {
  '.props': (def) => Object.keys(def.fields),
  '.meta':  ()    => [...MetaField.names()],
  '.all':   (def) => [...MetaField.names(), ...Object.keys(def.fields)],
}

const AVAILABLE_GROUPS = Object.keys(FIELD_GROUPS)

function isGroupSelector(token: string): boolean {
  return token.startsWith(GROUP_PREFIX)
}

/** Parse comma-separated field list. */
export function parseFieldList(input: string): string[] {
  return input.split(',').map(f => f.trim()).filter(Boolean)
}

/**
 * Expand group selectors (`.props`, `.meta`, `.all`) in a parsed field list.
 * Non-group tokens pass through unchanged. Duplicates are removed.
 */
export function expandFieldGroups(fields: string[], def: EntityDefAny): string[] {
  const result: string[] = []
  for (const f of fields) {
    if (isGroupSelector(f)) {
      const expander = FIELD_GROUPS[f]
      if (!expander) {
        throw ErrUnknownFieldGroup.create({ group: f, available: AVAILABLE_GROUPS })
      }
      result.push(...expander(def))
    } else {
      result.push(f)
    }
  }
  return [...new Set(result)]
}

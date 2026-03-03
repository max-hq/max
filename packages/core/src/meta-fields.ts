/**
 * Meta fields - Max-provided virtual fields available on every entity.
 *
 * Meta fields use the `_` prefix, which is reserved and cannot be used
 * by connector-defined schema fields. They are resolved at runtime from
 * the EntityResult's ref and other metadata, not from the field data map.
 *
 * Currently defined:
 *   _id  - raw entity ID (ref.id). Always visible by default, filterable.
 *   _ref - scoped reference key (ref.toKey()). Opt-in, not filterable.
 */

import { StaticTypeCompanion } from "./companion.js";
import type { RefAny } from "./ref.js";

/** The shape that MetaField resolvers need - just the ref. */
export interface MetaFieldSource {
  readonly ref: RefAny;
}

export interface MetaFieldDef {
  /** Field name including `_` prefix */
  readonly name: string;
  readonly description: string;
  /** Whether this field appears in default output (no --fields) */
  readonly defaultVisible: boolean;
  /** Whether this field can be used in filter expressions */
  readonly filterable: boolean;
  /** Extract the value from an entity result */
  resolve(source: MetaFieldSource): unknown;
}

const PREFIX = "_";

const BY_NAME: Record<string, MetaFieldDef> = {
  _id: {
    name: "_id",
    description: "Raw entity ID",
    defaultVisible: true,
    filterable: true,
    resolve: (r) => r.ref.id,
  },
  _ref: {
    name: "_ref",
    description: "Scoped reference key",
    defaultVisible: false,
    filterable: false,
    resolve: (r) => r.ref.toKey(),
  },
};

const ALL_DEFS: readonly MetaFieldDef[] = Object.values(BY_NAME);
const ALL_NAMES: readonly string[] = Object.keys(BY_NAME);
const DEFAULT_NAMES: readonly string[] = ALL_DEFS.filter(m => m.defaultVisible).map(m => m.name);
const FILTERABLE_NAMES: readonly string[] = ALL_DEFS.filter(m => m.filterable).map(m => m.name);

export const MetaField = StaticTypeCompanion({
  /** All registered meta fields */
  all: ALL_DEFS,

  /** Check if a field name belongs to the reserved meta namespace */
  isMeta(name: string): boolean {
    return name.startsWith(PREFIX);
  },

  /** Look up a meta field definition by name */
  get(name: string): MetaFieldDef | undefined {
    return BY_NAME[name];
  },

  /** All meta field names */
  names(): readonly string[] {
    return ALL_NAMES;
  },

  /** Meta field names that appear in default output */
  defaultNames(): readonly string[] {
    return DEFAULT_NAMES;
  },

  /** Meta field names that can be used in filter expressions */
  filterableNames(): readonly string[] {
    return FILTERABLE_NAMES;
  },

  /** Resolve a meta field value from a source. Returns undefined if not a known meta field. */
  resolve(name: string, source: MetaFieldSource): unknown {
    return BY_NAME[name]?.resolve(source);
  },
});

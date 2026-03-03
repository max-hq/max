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

const ALL: readonly MetaFieldDef[] = [
  {
    name: "_id",
    description: "Raw entity ID",
    defaultVisible: true,
    filterable: true,
    resolve: (r) => r.ref.id,
  },
  {
    name: "_ref",
    description: "Scoped reference key",
    defaultVisible: false,
    filterable: false,
    resolve: (r) => r.ref.toKey(),
  },
];

export const MetaField = StaticTypeCompanion({
  /** All registered meta fields */
  all: ALL,

  /** Check if a field name belongs to the reserved meta namespace */
  isMeta(name: string): boolean {
    return name.startsWith(PREFIX);
  },

  /** Look up a meta field definition by name */
  get(name: string): MetaFieldDef | undefined {
    return ALL.find(m => m.name === name);
  },

  /** All meta field names */
  names(): string[] {
    return ALL.map(m => m.name);
  },

  /** Meta field names that appear in default output */
  defaultNames(): string[] {
    return ALL.filter(m => m.defaultVisible).map(m => m.name);
  },

  /** Meta field names that can be used in filter expressions */
  filterableNames(): string[] {
    return ALL.filter(m => m.filterable).map(m => m.name);
  },

  /** Resolve a meta field value from a source. Returns undefined if not a known meta field. */
  resolve(name: string, result: MetaFieldSource): unknown {
    const def = MetaField.get(name);
    return def ? def.resolve(result) : undefined;
  },
});

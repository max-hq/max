/**
 * SqliteSchema - registry of entity definitions and their table mappings.
 */

import type { Database } from "bun:sqlite";
import type {EntityDefAny, Schema} from "@max/core";
import { buildTableDef, generateCreateTableSql, type TableDef } from "./table-def.js";
import { ErrEntityNotRegistered } from "./errors.js";

export class SqliteSchema {
  private tables = new Map<string, TableDef>();

  /** Register an entity definition */
  register(entityDef: EntityDefAny): this {
    const tableDef = buildTableDef(entityDef);
    this.tables.set(entityDef.name, tableDef);
    return this;
  }

  registerSchema(schema: Schema): this {
    schema.entities.forEach(s => this.register(s))
    return this
  }

  /** Get the TableDef for an entity definition */
  getTable(entityDef: EntityDefAny): TableDef {
    const tableDef = this.tables.get(entityDef.name);
    if (!tableDef) {
      throw ErrEntityNotRegistered.create({ entityType: entityDef.name });
    }
    return tableDef;
  }

  /** Create all registered tables in the database, migrating old schemas as needed. */
  ensureTables(db: Database): void {
    for (const tableDef of this.tables.values()) {
      this.migrateIdColumn(db, tableDef.tableName);
      const sql = generateCreateTableSql(tableDef);
      db.run(sql);
      this.addMissingColumns(db, tableDef);
    }
  }

  /** Add any columns present in the schema but missing from the DB table. */
  private addMissingColumns(db: Database, tableDef: TableDef): void {
    const cols = db.query(`PRAGMA table_info(${tableDef.tableName})`).all() as { name: string }[];
    if (cols.length === 0) return;

    const existing = new Set(cols.map(c => c.name));
    for (const col of tableDef.columns) {
      if (!existing.has(col.columnName)) {
        db.run(`ALTER TABLE ${tableDef.tableName} ADD COLUMN ${col.columnName} ${col.sqlType}`);
      }
    }
  }

  /** Rename legacy `id` column to `_id` if the table already exists with the old name. */
  // NOTE: This is a stop-gap, and won't impact anyone externally. We need an actual versioned migration system. On the roadmap.
  /** @deprecated (see above) */
  private migrateIdColumn(db: Database, tableName: string): void {
    const cols = db.query(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    if (cols.length === 0) return; // table doesn't exist yet
    const hasOldId = cols.some(c => c.name === "id");
    const hasNewId = cols.some(c => c.name === "_id");
    if (hasOldId && !hasNewId) {
      db.run(`ALTER TABLE ${tableName} RENAME COLUMN id TO _id`);
    }
  }

  /** Get all registered TableDefs */
  allTables(): TableDef[] {
    return Array.from(this.tables.values());
  }
}

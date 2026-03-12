/**
 * SqliteEngine - Engine implementation backed by SQLite.
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import {
  type Engine,
  type EntityDefAny,
  type EntityInput,
  type EntityInputAny,
  EntityResult,
  type EntityFields,
  type EntityQuery,
  type FieldsAll,
  type FieldsSelect,
  Page,
  PageRequest,
  type ResolvedPageRequest,
  type Projection,
  Ref,
  type CollectionKeys,
  type CollectionTargetRef,
  type EntityId,
  type Schema,
  LifecycleManager,
  InstallationScope,
  type SelectProjection,
  type RefsProjection,
  type AllProjection,
  type EntityFieldsPick,
  RefKey,
  EntityFieldsKeys,
  type WhereClause,
} from '@max/core'
import { SqliteSchema } from "./schema.js";
import type { TableDef, ColumnDef } from "./table-def.js";
import { ErrEntityNotFound, ErrFieldNotFound, ErrCollectionNotSupported } from "./errors.js";

/** Synthetic ColumnDef for the _id primary key column (not part of schema fields). */
const ID_COLUMN: ColumnDef = { columnName: "_id", fieldName: "_id", sqlType: "TEXT", isRef: false };

/** Quote a SQL identifier to avoid reserved-word collisions. */
const q = (name: string) => `"${name}"`;

export class SqliteEngine implements Engine<InstallationScope> {
  readonly db: Database;
  private schema: SqliteSchema;

  lifecycle = LifecycleManager.on({
    stop: () => { this.db.close(); },
  });

  constructor(db: Database, schema: SqliteSchema) {
    this.db = db;
    this.schema = schema;
  }

  /** Open a SQLite DB at `path`, register the schema, ensure tables, and return the engine. */
  static open(path: string, schema: Schema): SqliteEngine {
    const db = new Database(path, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    const sqliteSchema = new SqliteSchema().registerSchema(schema);
    sqliteSchema.ensureTables(db);
    return new SqliteEngine(db, sqliteSchema);
  }

  async store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>> {
    await this.storeMany([input]);
    return Ref.installation(input.ref.entityDef, input.ref.id as EntityId);
  }

  async storeMany(inputs: EntityInputAny[]): Promise<void> {
    if (inputs.length === 0) return;

    this.db.transaction(() => {
      for (const input of inputs) {
        const tableDef = this.schema.getTable(input.ref.entityDef);
        const id = input.ref.id;

        const columnNames: string[] = ["_id"];
        const placeholders: string[] = ["?"];
        const values: SQLQueryBindings[] = [id];

        for (const col of tableDef.columns) {
          const fieldValue = (input.fields as Record<string, unknown>)[col.fieldName];
          if (fieldValue === undefined) continue;

          columnNames.push(q(col.columnName));
          placeholders.push("?");
          values.push(this.toSqlValue(fieldValue, col) as SQLQueryBindings);
        }

        const sql = `INSERT OR REPLACE INTO ${q(tableDef.tableName)} (${columnNames.join(", ")}) VALUES (${placeholders.join(", ")})`;
        this.db.run(sql, values);
      }
    })();
  }

  async load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>
  ): Promise<EntityResult<E, K>>;

  async load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | "*"
  ): Promise<EntityResult<E, keyof EntityFields<E>>>;

  async load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K> | FieldsAll | "*"
  ): Promise<EntityResult<E, K>> {
    const tableDef = this.schema.getTable(ref.entityDef);

    // Determine which columns to select
    let columnsToLoad: ColumnDef[];
    if (fields === "*" || (typeof fields === "object" && fields.kind === "all")) {
      columnsToLoad = tableDef.columns;
    } else {
      const fieldNames = new Set(fields.fields as string[]);
      columnsToLoad = tableDef.columns.filter(col => fieldNames.has(col.fieldName));
    }

    const columnList = columnsToLoad.map(c => q(c.columnName)).join(", ");
    const sql = `SELECT ${columnList} FROM ${q(tableDef.tableName)} WHERE _id = ?`;
    const row = this.db.query(sql).get(ref.id) as Record<string, unknown> | null;

    if (!row) {
      throw ErrEntityNotFound.create({ entityType: ref.entityType, entityId: ref.id });
    }

    // Convert row to field values
    const data: Record<string, unknown> = {};
    for (const col of columnsToLoad) {
      data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, ref.entityDef);
    }

    return EntityResult.from(ref, data as { [P in K]: EntityFields<E>[P] });
  }

  async loadField<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<EntityFields<E>[K]> {
    const tableDef = this.schema.getTable(ref.entityDef);
    const col = tableDef.columns.find(c => c.fieldName === field);
    if (!col) {
      throw ErrFieldNotFound.create({ entityType: ref.entityType, field: String(field) });
    }

    const sql = `SELECT ${q(col.columnName)} FROM ${q(tableDef.tableName)} WHERE _id = ?`;
    const row = this.db.query(sql).get(ref.id) as Record<string, unknown> | null;

    if (!row) {
      throw ErrEntityNotFound.create({ entityType: ref.entityType, entityId: ref.id });
    }

    return this.fromSqlValue(row[col.columnName], col, ref.entityDef) as EntityFields<E>[K];
  }

  async loadCollection<E extends EntityDefAny, K extends CollectionKeys<E>>(
    _ref: Ref<E>,
    _field: K,
    _options?: PageRequest
  ): Promise<Page<CollectionTargetRef<E, K>>> {
    throw ErrCollectionNotSupported.create({});
  }

  // loadPage overload signatures
  loadPage<E extends EntityDefAny>(
    def: E,
    projection: RefsProjection,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>;

  loadPage<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    def: E,
    projection: SelectProjection<E,K>,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, K>>>;

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: AllProjection,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>;

  // loadPage implementation
  async loadPage<E extends EntityDefAny>(
    def: E,
    projection: Projection,
    inputPage?: PageRequest
  ): Promise<Page<unknown>> {
    const tableDef = this.schema.getTable(def);
    const page = PageRequest.from(inputPage).defaultLimit(1000);

    // Determine columns based on projection
    let columns: ColumnDef[];
    let columnNames: string[];

    switch (projection.kind) {
      case "refs":
        columns = [];
        columnNames = ["_id"];
        break;
      case "select":
        columns = projection.fields.map(f => this.getColumn(tableDef, def, f));
        columnNames = ["_id", ...columns.map(c => q(c.columnName))];
        break;
      case "all":
        columns = tableDef.columns;
        columnNames = ["_id", ...columns.map(c => q(c.columnName))];
        break;
    }

    // Cursor-based: WHERE _id > cursor ORDER BY _id
    let sql = `SELECT ${columnNames.join(", ")} FROM ${q(tableDef.tableName)}`;
    const params: SQLQueryBindings[] = [];

    if (page.cursor) {
      const parsed = RefKey.parse(page.cursor as RefKey);
      sql += ` WHERE _id > ?`;
      params.push(parsed.entityId);
    }

    sql += ` ORDER BY _id ASC LIMIT ${page.fetchSize}`;
    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];

    switch (projection.kind) {
      case "refs": {
        const items = rows.map(row => Ref.installation(def, row._id as EntityId));
        return this.toCursorPage(items, page.limit, ref => ref.toKey() as string);
      }
      case "select":
      case "all": {
        const items = rows.map(row => {
          const ref = Ref.installation(def, row._id as EntityId);
          const data: Record<string, unknown> = {};
          for (const col of columns) {
            data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, def);
          }
          return EntityResult.from(ref, data as any);
        });
        return this.toCursorPage(items, page.limit, result => result.ref.toKey() as string);
      }
    }
  }

  // Overload signatures
  query<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    query: EntityQuery<E, SelectProjection<E,K>>,
    page?: PageRequest,
  ): Promise<Page<EntityResult<E, K>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, RefsProjection>,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, AllProjection>,
    page?: PageRequest,
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>;

  // Implementation
  async query<E extends EntityDefAny>(
    query: EntityQuery<E>,
    inputPage?: PageRequest,
  ): Promise<Page<unknown>> {
    const tableDef = this.schema.getTable(query.def);
    const { projection } = query;
    const page = PageRequest.from(inputPage).defaultLimit(1000);

    // Determine columns to select based on projection
    let columns: ColumnDef[];
    let columnNames: string[];

    switch (projection.kind) {
      case "refs":
        columns = [];
        columnNames = ["_id"];
        break;
      case "select":
        columns = projection.fields.map(f => this.getColumn(tableDef, query.def, f));
        columnNames = ["_id", ...columns.map(c => q(c.columnName))];
        break;
      case "all":
        columns = tableDef.columns;
        columnNames = ["_id", ...columns.map(c => q(c.columnName))];
        break;
    }

    // Build SQL
    const { sql, params } = this.buildQuerySql(tableDef, query, page, columnNames);
    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];

    // Map rows to results based on projection
    switch (projection.kind) {
      case "refs": {
        const items = rows.map(row =>
          Ref.installation(query.def, row._id as EntityId)
        );
        return this.toCursorPage(items, page.limit, ref => ref.toKey() as string);
      }
      case "select": // fallthrough
      case "all": {
        const items = rows.map(row => {
          const ref = Ref.installation(query.def, row._id as EntityId);
          const data: Record<string,unknown> = {};
          for (const col of columns) {
            data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, query.def);
          }
          return EntityResult.from(ref, data as EntityFieldsPick<E, string>)
        });
        return this.toCursorPage(items, page.limit, result => result.ref.toKey() as string);
      }
    }
  }

  /** Build SQL query string from an EntityQuery descriptor + resolved pagination. */
  private buildQuerySql<E extends EntityDefAny>(
    tableDef: TableDef,
    query: EntityQuery<E>,
    page: ResolvedPageRequest,
    columnNames: string[],
  ): { sql: string; params: SQLQueryBindings[] } {
    let sql = `SELECT ${columnNames.join(", ")} FROM ${q(tableDef.tableName)}`;
    const params: SQLQueryBindings[] = [];
    const conditions: string[] = [];

    // User-defined filters - recursive WHERE clause
    // Must come before cursor so params are in the same order as SQL placeholders.
    const userWhere = this.buildWhereSql(query.filters, tableDef, query.def, params);
    if (userWhere) conditions.push(userWhere);

    // Cursor-based pagination: WHERE _id > cursor (cursor is a RefKey)
    if (page.cursor) {
      const parsed = RefKey.parse(page.cursor as RefKey);
      params.push(parsed.entityId);
      conditions.push(`_id > ?`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // ORDER BY: user ordering first, then _id as tiebreaker for stable cursor pagination
    const orderParts: string[] = [];
    if (query.ordering) {
      const col = this.getColumn(tableDef, query.def, query.ordering.field);
      orderParts.push(`${q(col.columnName)} ${query.ordering.dir.toUpperCase()}`);
    }
    orderParts.push("_id ASC");
    sql += ` ORDER BY ${orderParts.join(", ")}`;

    sql += ` LIMIT ${page.fetchSize}`;

    return { sql, params };
  }

  /**
   * Wrap items into a cursor-based Page using the limit+1 pattern.
   * Cursor is extracted from the last item in the trimmed page via getCursor.
   */
  private toCursorPage<T>(items: T[], limit: number, getCursor: (item: T) => string): Page<T> {
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const cursor = hasMore && pageItems.length > 0
      ? getCursor(pageItems[pageItems.length - 1])
      : undefined;
    return Page.from(pageItems, hasMore, cursor);
  }

  /**
   * Recursively build a SQL WHERE fragment from a WhereClause tree.
   * Returns null for empty clauses (no filtering).
   * Mutates `params` by appending bound values.
   */
  private buildWhereSql(
    clause: WhereClause,
    tableDef: TableDef,
    entityDef: EntityDefAny,
    params: SQLQueryBindings[],
  ): string | null {
    // Leaf: single comparison
    if (!('kind' in clause)) {
      const col = this.getColumn(tableDef, entityDef, clause.field);
      const sqlOp = clause.op === "contains" ? "LIKE" : clause.op;
      const sqlValue = clause.op === "contains"
        ? `%${clause.value}%`
        : this.toSqlValue(clause.value, col);
      params.push(sqlValue as SQLQueryBindings);
      return `${q(col.columnName)} ${sqlOp} ?`;
    }

    // AND/OR: recurse into children
    const parts: string[] = [];
    for (const child of clause.clauses) {
      const childSql = this.buildWhereSql(child, tableDef, entityDef, params);
      if (childSql) parts.push(childSql);
    }

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];

    const joiner = clause.kind === 'and' ? ' AND ' : ' OR ';
    return `(${parts.join(joiner)})`;
  }

  /** Look up a ColumnDef by field name, throwing if not found. */
  private getColumn(tableDef: TableDef, entityDef: EntityDefAny, fieldName: string): ColumnDef {
    if (fieldName === "_id") return ID_COLUMN;
    const col = tableDef.columns.find(c => c.fieldName === fieldName);
    if (!col) {
      throw ErrFieldNotFound.create({ entityType: entityDef.name, field: fieldName });
    }
    return col;
  }

  /** Convert a TypeScript value to SQL-compatible value */
  private toSqlValue(value: unknown, col: ColumnDef): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (col.isRef) {
      // Ref field: store the id
      if (typeof value === 'string') {
        // Filter values arrive as plain strings - either a full RefKey or a raw entity ID
        const parsed = RefKey.tryParse(value);
        return parsed ? parsed.entityId : value;
      }
      return (value as Ref<EntityDefAny>).id;
    }

    if (col.sqlType === "INTEGER" && typeof value === "boolean") {
      return value ? 1 : 0;
    }

    if (col.sqlType === "TEXT" && value instanceof Date) {
      return value.toISOString();
    }

    return value;
  }

  /** Convert a SQL value back to TypeScript value */
  private fromSqlValue(value: unknown, col: ColumnDef, entityDef: EntityDefAny): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (col.isRef) {
      // Ref field: reconstruct the Ref
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "ref") {
        return Ref.installation(fieldDef.target, value as EntityId);
      }
    }

    if (col.sqlType === "INTEGER") {
      // Check if this is actually a boolean field
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "boolean") {
        return value === 1;
      }
    }

    if (col.sqlType === "TEXT") {
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "date") {
        return new Date(value as string);
      }
    }

    return value;
  }
}

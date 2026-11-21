import { columnOfField, decode, encode, q, type Doc } from './codec';
import { resolveEntity, specOf } from './schema';

/** What runs SQL: a pg Pool, or one client inside a transaction. */
export interface Queryable {
  query<R extends Doc = Doc>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface StoredDoc<T extends Doc = Doc> {
  id: string;
  row: T;
}

/**
 * Which rows: equality on fields (`{ cardId, on: true }`), `contains` for a
 * field holding a list (`userIds`, `resonanceCards`), `in` for one of many
 * values. Fields without a column of their own filter on `extra`.
 */
export interface Filter {
  eq?: Doc;
  contains?: Doc;
  in?: Record<string, readonly unknown[]>;
  /** `order by` (columns, e.g. `"at" desc, "user_id" desc`); the key by default. */
  order?: string;
  limit?: number;
}

function where(entity: string, filter: Filter = {}, params: unknown[]): string {
  const spec = specOf(entity);
  const out: string[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  for (const [field, value] of Object.entries(filter.eq ?? {})) {
    const col = columnOfField(spec, field);
    if (!col || col.kind === 'pair' || col.kind === 'array') out.push(`${q('extra')} -> ${p(field)} = ${p(JSON.stringify(value))}::jsonb`);
    else if (value === null) out.push(`${q(col.name)} is null`);
    else out.push(`${q(col.name)} = ${p(value)}`);
  }
  for (const [field, value] of Object.entries(filter.contains ?? {})) {
    const col = columnOfField(spec, field);
    if (col?.kind === 'pair') out.push(`(${q(col.pair![0])} = ${p(value)} or ${q(col.pair![1])} = ${p(value)})`);
    else if (col?.kind === 'array') out.push(`${p(value)} = any(${q(col.name)})`);
    else out.push(`${q('extra')} -> ${p(field)} @> ${p(JSON.stringify([value]))}::jsonb`);
  }
  for (const [field, values] of Object.entries(filter.in ?? {})) {
    const col = columnOfField(spec, field);
    if (!col || col.kind !== 'col') throw new Error(`${entity}.${field}: \`in\` needs a column`);
    out.push(`${q(col.name)} = any(${p([...values])})`);
  }
  return out.length ? `where ${out.join(' and ')}` : '';
}

/** The key columns' `where`, for one row. */
function keyWhere(key: { name: string; value: unknown; cast: string }[], params: unknown[]): string {
  return key
    .map((k) => {
      params.push(k.value);
      return `${q(k.name)} = $${params.length}::${k.cast}`;
    })
    .join(' and ');
}

/**
 * Documents over PostgreSQL, as MemoryState keeps them (`table/id → row`),
 * on the tables of schema.ts: what the repositories, the replicator and the
 * tests read and write through. `table` is an entity (`cards`) or a
 * subcollection's path (`users/{uid}/blocks`).
 */
export class PgDocs {
  constructor(readonly db: Queryable) {}

  async get<T extends Doc = Doc>(table: string, id: string): Promise<T | null> {
    const { entity, id: rowId } = resolveEntity(table, id);
    const spec = specOf(entity);
    let key;
    try {
      key = encode(spec, rowId, {}, false).key;
    } catch {
      return null;
    }
    const params: unknown[] = [];
    const { rows } = await this.db.query(`select * from ${q(spec.table)} where ${keyWhere(key, params)}`, params);
    return rows[0] ? (decode(spec, rows[0]).doc as T) : null;
  }

  /** Rows of an entity, by its id order unless `filter.order` says otherwise. */
  async rows<T extends Doc = Doc>(entity: string, filter: Filter = {}): Promise<StoredDoc<T>[]> {
    const spec = specOf(entity);
    const params: unknown[] = [];
    const sql = `select * from ${q(spec.table)} ${where(entity, filter, params)} order by ${filter.order ?? spec.key.map((k) => (k.int ? q(k.col) : `${q(k.col)} collate "C"`)).join(', ')}${
      filter.limit !== undefined ? ` limit ${Math.max(0, Math.floor(filter.limit))}` : ''
    }`;
    const { rows } = await this.db.query(sql, params);
    return rows.map((r) => {
      const { id, doc } = decode(spec, r);
      return { id, row: doc as T };
    });
  }

  async count(entity: string, filter: Filter = {}): Promise<number> {
    const spec = specOf(entity);
    const params: unknown[] = [];
    const { rows } = await this.db.query<{ n: string }>(`select count(*) as n from ${q(spec.table)} ${where(entity, filter, params)}`, params);
    return Number(rows[0]?.n ?? 0);
  }

  /** Write the whole document (replacing any). */
  async put(table: string, id: string, doc: Doc): Promise<void> {
    const { entity, id: rowId } = resolveEntity(table, id);
    const spec = specOf(entity);
    const e = encode(spec, rowId, doc, true);
    const params: unknown[] = [];
    const names = [...e.key.map((k) => k.name), ...e.cols.map((c) => c.name), 'extra'];
    const values = [...e.key, ...e.cols].map((c) => {
      params.push(c.value);
      return `$${params.length}::${c.cast}`;
    });
    params.push(JSON.stringify(e.extra));
    values.push(`$${params.length}::jsonb`);
    const conflict = e.key.map((k) => q(k.name)).join(', ');
    const set = [...e.cols.map((c) => c.name), 'extra'].map((n) => `${q(n)} = excluded.${q(n)}`).join(', ');
    await this.db.query(`insert into ${q(spec.table)} (${names.map(q).join(', ')}) values (${values.join(', ')}) on conflict (${conflict}) do update set ${set}`, params);
  }

  /** Merge these fields into the document (made when absent); a field set to `undefined` is removed — MemoryState.merge. */
  async merge(table: string, id: string, fields: Doc): Promise<void> {
    const { entity, id: rowId } = resolveEntity(table, id);
    const spec = specOf(entity);
    const e = encode(spec, rowId, fields, false);
    const params: unknown[] = [];
    const names = [...e.key.map((k) => k.name), ...e.cols.map((c) => c.name), 'extra'];
    const values = [...e.key, ...e.cols].map((c) => {
      params.push(c.value);
      return `$${params.length}::${c.cast}`;
    });
    params.push(JSON.stringify(e.extra));
    const extraParam = `$${params.length}::jsonb`;
    values.push(extraParam);
    params.push([...e.fields, ...e.removed]);
    const drop = `$${params.length}::text[]`;
    const conflict = e.key.map((k) => q(k.name)).join(', ');
    const set = [
      ...[...new Set(e.cols.map((c) => c.name))].map((n) => `${q(n)} = excluded.${q(n)}`),
      `${q('extra')} = (${q(spec.table)}.${q('extra')} - ${drop}) || excluded.${q('extra')}`,
    ].join(', ');
    await this.db.query(`insert into ${q(spec.table)} (${names.map(q).join(', ')}) values (${values.join(', ')}) on conflict (${conflict}) do update set ${set}`, params);
  }

  async delete(table: string, id: string): Promise<void> {
    const { entity, id: rowId } = resolveEntity(table, id);
    const spec = specOf(entity);
    let key;
    try {
      key = encode(spec, rowId, {}, false).key;
    } catch {
      return;
    }
    const params: unknown[] = [];
    await this.db.query(`delete from ${q(spec.table)} where ${keyWhere(key, params)}`, params);
  }

  /** Delete the rows a filter finds; answers how many went. */
  async deleteWhere(entity: string, filter: Filter): Promise<number> {
    const spec = specOf(entity);
    const params: unknown[] = [];
    const w = where(entity, filter, params);
    if (!w) throw new Error(`${entity}: deleteWhere without a filter`);
    const r = await this.db.query(`delete from ${q(spec.table)} ${w}`, params);
    return r.rowCount ?? 0;
  }

  /** Seed documents (a test's starting data). */
  async seed(table: string, rows: Record<string, Doc>): Promise<void> {
    for (const [id, row] of Object.entries(rows)) await this.put(table, id, row);
  }
}

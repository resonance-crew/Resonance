import { idOf, keyOf, type ColSpec, type ColType, type TableSpec } from './schema';

/**
 * Documents ⇄ rows (schema.ts): the typed columns a document's fields fit,
 * the rest in `extra`. Lossless both ways — a row read back is the document
 * as written: a field written `null` reads back null and an absent one stays
 * absent, a value its column can't hold goes to `extra` under its own name,
 * and Dates inside `extra` / jsonb travel tagged (`{ "$t": iso }`).
 */

export type Doc = Record<string, unknown>;

const TAG = '$t';
const ABSENT = '$absent';

/** A JSON-safe copy, Dates tagged. */
export function toJson(v: unknown): unknown {
  if (v instanceof Date) return { [TAG]: v.toISOString() };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') {
    const out: Doc = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = toJson(x);
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** toJson's inverse. */
export function fromJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === 'object') {
    const o = v as Doc;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === TAG && typeof o[TAG] === 'string') return new Date(o[TAG] as string);
    const out: Doc = {};
    for (const [k, x] of Object.entries(o)) out[k] = fromJson(x);
    return out;
  }
  return v;
}

/** The value as its column holds it; `undefined` when the column can't hold it (the field then goes to `extra`). */
function fit(type: ColType, v: unknown): unknown {
  switch (type) {
    case 'text':
      return typeof v === 'string' ? v : undefined;
    case 'int':
      return Number.isInteger(v) && Math.abs(v as number) <= 2 ** 31 - 1 ? v : undefined;
    case 'bigint':
      return Number.isSafeInteger(v) ? v : undefined;
    case 'real':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    case 'bool':
      return typeof v === 'boolean' ? v : undefined;
    case 'ts':
      return v instanceof Date && !Number.isNaN(v.getTime()) ? v : undefined;
    case 'jsonb':
      return JSON.stringify(toJson(v));
    case 'text[]':
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : undefined;
    case 'vector':
      return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? `[${v.join(',')}]` : undefined;
  }
}

function unfit(type: ColType, v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  switch (type) {
    case 'bigint':
      return typeof v === 'string' ? Number(v) : v;
    case 'jsonb':
      return fromJson(v);
    case 'vector':
      return typeof v === 'string' ? (JSON.parse(v) as number[]) : v;
    default:
      return v;
  }
}

/** A column of the table and the SQL type a parameter is cast to. */
export interface Column {
  name: string;
  cast: string;
}

const CASTS: Record<ColType, string> = {
  text: 'text',
  int: 'int',
  bigint: 'bigint',
  real: 'real',
  bool: 'boolean',
  ts: 'timestamptz',
  jsonb: 'jsonb',
  'text[]': 'text[]',
  vector: 'vector',
};

/** Every column a spec's field writes (a pair writes two). */
export function columnsOf(spec: ColSpec): Column[] {
  return 'pair' in spec ? spec.pair.map((name) => ({ name, cast: 'text' })) : [{ name: spec.col, cast: CASTS[spec.type] }];
}

/** The SQL identifier, quoted. */
export const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

export interface Encoded {
  key: { name: string; value: unknown; cast: string }[];
  /** Typed columns and their values (a field's columns are null when it is absent or doesn't fit). */
  cols: { name: string; value: unknown; cast: string; field: string }[];
  /** Fields that go to `extra` (JSON-safe). */
  extra: Doc;
  /** Fields the document named, typed or not (a merge clears their old `extra` entries). */
  fields: string[];
  /** Fields a merge removes (`undefined`). */
  removed: string[];
}

/**
 * A document as a row. `whole`: every typed column is written (a put);
 * otherwise only the fields the document names (a merge).
 */
export function encode(spec: TableSpec, id: string, doc: Doc, whole: boolean): Encoded {
  const parts = keyOf(spec, id);
  if (!parts) throw new Error(`${spec.table}: ${JSON.stringify(id)} is not a row id (${spec.key.map((k) => k.col).join(spec.sep ?? '_')})`);
  const key = spec.key.map((k, i) => ({ name: k.col, value: k.int ? Number(parts[i]) : parts[i], cast: k.int ? 'int' : 'text' }));
  const extra: Doc = {};
  const cols: Encoded['cols'] = [];
  const removed: string[] = [];
  const fields: string[] = [];
  const keyFields = new Map(spec.key.flatMap((k, i) => (k.field ? [[k.field, String(parts[i])] as const] : [])));
  const absent = [...keyFields.keys()].filter((f) => doc[f] === undefined);
  if (whole && absent.length) extra[ABSENT] = absent;

  for (const [field, value] of Object.entries(doc)) {
    if (value === undefined) {
      removed.push(field);
      continue;
    }
    fields.push(field);
    if (keyFields.has(field)) {
      // The key holds it; a value other than the key's (or not a string) is kept as written.
      if (String(value) !== keyFields.get(field) || (typeof value !== 'string' && !(spec.key.find((k) => k.field === field)?.int && typeof value === 'number'))) {
        extra[field] = toJson(value);
      }
      continue;
    }
    const colSpec = spec.cols[field];
    if (!colSpec) {
      extra[field] = toJson(value);
      continue;
    }
    if ('pair' in colSpec) {
      const ok = Array.isArray(value) && value.length === 2 && value.every((x) => typeof x === 'string') && value[0] < value[1];
      colSpec.pair.forEach((name, i) => cols.push({ name, value: ok ? (value as string[])[i] : null, cast: 'text', field }));
      if (!ok) extra[field] = toJson(value);
      continue;
    }
    const fitted = value === null ? undefined : fit(colSpec.type, value);
    cols.push({ name: colSpec.col, value: fitted ?? null, cast: CASTS[colSpec.type], field });
    if (fitted === undefined) extra[field] = toJson(value);
  }

  if (whole) {
    const named = new Set(cols.map((c) => c.name));
    for (const [field, colSpec] of Object.entries(spec.cols)) {
      for (const col of columnsOf(colSpec)) if (!named.has(col.name)) cols.push({ name: col.name, value: null, cast: col.cast, field });
    }
  } else {
    for (const field of removed) {
      const colSpec = spec.cols[field];
      if (colSpec) for (const col of columnsOf(colSpec)) cols.push({ name: col.name, value: null, cast: col.cast, field });
    }
  }
  return { key, cols, extra, fields, removed };
}

/** A row as its id and document. */
export function decode(spec: TableSpec, row: Doc): { id: string; doc: Doc } {
  const parts = spec.key.map((k) => String(row[k.col]));
  const extra = (row.extra ?? {}) as Doc;
  const absent = new Set(Array.isArray(extra[ABSENT]) ? (extra[ABSENT] as string[]) : []);
  const doc: Doc = {};
  spec.key.forEach((k, i) => {
    if (k.field && !absent.has(k.field)) doc[k.field] = k.int ? Number(parts[i]) : parts[i];
  });
  for (const [field, colSpec] of Object.entries(spec.cols)) {
    if ('pair' in colSpec) {
      const [a, b] = colSpec.pair.map((name) => row[name]);
      if (typeof a === 'string' && typeof b === 'string') doc[field] = [a, b];
      continue;
    }
    const v = unfit(colSpec.type, row[colSpec.col]);
    if (v !== undefined) doc[field] = v;
  }
  for (const [field, v] of Object.entries(extra)) if (field !== ABSENT) doc[field] = fromJson(v);
  return { id: idOf(spec, parts), doc };
}

/** The column a field filters on: a typed column, a key part (by field or by column), or null (the field lives in `extra`). */
export function columnOfField(spec: TableSpec, field: string): { name: string; kind: 'col' | 'pair' | 'array'; pair?: [string, string] } | null {
  const colSpec = spec.cols[field];
  if (!colSpec) {
    const keyPart = spec.key.find((k) => k.field === field) ?? spec.key.find((k) => k.col === field);
    return keyPart ? { name: keyPart.col, kind: 'col' } : null;
  }
  if ('pair' in colSpec) return { name: colSpec.pair[0], kind: 'pair', pair: colSpec.pair };
  return { name: colSpec.col, kind: colSpec.type === 'text[]' ? 'array' : 'col' };
}

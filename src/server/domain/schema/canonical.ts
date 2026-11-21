import { createHash } from 'node:crypto';
import { isInstant, type Instant } from '@/server/ports/time';
import type { EntitySchema, Field } from './fields';

/**
 * Stored rows ⇄ canonical rows (plan §4.1–§4.2), the same code for every
 * store: an adapter hands a `StoreCodec` that recognises and makes its own
 * value types (Firestore's Timestamp, VectorValue, DocumentReference; the
 * memory adapter's Date and Instant strings), and nothing else differs.
 *
 * A known field is written by its kind (fields.ts): a time as an Instant, a
 * vector as `number[]`. Anything else — a field the schema doesn't name, a
 * `json()` field — goes in the generic encoding: JSON values as they are,
 * and the values JSON has no word for as one-key tagged objects
 * `{ $time }`, `{ $ref }`, `{ $bytes }`, `{ $vector }`, `{ $geo }`, `{ $num }`
 * (and `{ $raw }`: a known field's value off its kind, in a lenient export);
 * a stored map with a key starting with `$` is wrapped as `{ $obj }` so a
 * tag is never ambiguous. So the encoding loses nothing and decodes back to
 * the same stored value. A store's write sentinels (FieldValue) are never
 * read back, and one seen is refused.
 */

export type CanonicalRow = Record<string, unknown>;

/** The values a store keeps that JSON has no word for. */
export interface StoreCodec {
  /** An Instant for a stored time; `known` when the schema says the field is a time (memory then takes an Instant string too). */
  readTime(value: unknown, known: boolean): Instant | null;
  readVector(value: unknown): number[] | null;
  /** A document reference's path. */
  readRef(value: unknown): string | null;
  /** Bytes, base64. */
  readBytes(value: unknown): string | null;
  readGeo(value: unknown): [number, number] | null;
  /** The stored time for an Instant: `known` and `ordering` as the schema says (null: a generic `$time`). */
  writeTime(instant: Instant, field: { ordering: boolean } | null): unknown;
  writeVector(values: number[]): unknown;
  writeRef(path: string): unknown;
  writeBytes(base64: string): unknown;
  writeGeo(latLng: [number, number]): unknown;
}

/** A value off its field's kind, by field path (never the value). */
export class CanonicalMismatchError extends Error {
  constructor(
    readonly entity: string,
    readonly idHash: string,
    readonly path: string,
    readonly expected: string,
  ) {
    super(`${entity} ${idHash}: ${path} is not a ${expected}`);
    this.name = 'CanonicalMismatchError';
  }
}

export interface ToCanonicalOptions {
  /** Write a value off its kind in the generic encoding (and report its path) instead of refusing. */
  lenient?: boolean;
}

export interface ToCanonicalResult {
  row: CanonicalRow;
  /** Field paths whose value was off its kind (lenient only). */
  offSchema: string[];
  /** Top-level fields the schema doesn't name. */
  extras: string[];
}

const RESERVED = new Set(['_e', '_id', '_v']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isTag(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0].startsWith('$');
}

/** The generic encoding of a stored value (`path` names it in an error). */
export function encodeGeneric(value: unknown, codec: StoreCodec, path: string): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : { $num: String(value) };
  if (Array.isArray(value)) return value.map((v, i) => encodeGeneric(v, codec, `${path}[${i}]`) ?? null);
  const time = codec.readTime(value, false);
  if (time) return { $time: time };
  const vector = codec.readVector(value);
  if (vector) return { $vector: vector };
  const ref = codec.readRef(value);
  if (ref !== null) return { $ref: ref };
  const bytes = codec.readBytes(value);
  if (bytes !== null) return { $bytes: bytes };
  const geo = codec.readGeo(value);
  if (geo) return { $geo: geo };
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    let dollar = false;
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$')) dollar = true;
      const e = encodeGeneric(v, codec, `${path}.${k}`);
      if (e !== undefined) out[k] = e;
    }
    return dollar ? { $obj: out } : out;
  }
  throw new TypeError(`${path}: a stored value of an unknown type (${(value as object).constructor?.name ?? typeof value})`);
}

/** The stored value of a generic encoding. */
export function decodeGeneric(value: unknown, codec: StoreCodec): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => decodeGeneric(v, codec));
  const o = value as Record<string, unknown>;
  if (isTag(o)) {
    const [tag, v] = Object.entries(o)[0];
    switch (tag) {
      case '$time':
        return codec.writeTime(v as Instant, null);
      case '$vector':
        return codec.writeVector(v as number[]);
      case '$ref':
        return codec.writeRef(v as string);
      case '$bytes':
        return codec.writeBytes(v as string);
      case '$geo':
        return codec.writeGeo(v as [number, number]);
      case '$num':
        return Number(v);
      case '$raw':
        return decodeGeneric(v, codec);
      case '$obj':
        return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, decodeGeneric(x, codec)]));
      default:
        throw new TypeError(`Unknown tag ${tag}`);
    }
  }
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeGeneric(x, codec)]));
}

class OffKind extends Error {
  constructor(
    readonly path: string,
    readonly expected: string,
  ) {
    super(path);
  }
}

function encodeField(value: unknown, field: Field, codec: StoreCodec, path: string): unknown {
  if (value === undefined || value === null) return value;
  const off = () => {
    throw new OffKind(path, field.kind);
  };
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' ? value : off();
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : off();
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) ? value : off();
    case 'boolean':
      return typeof value === 'boolean' ? value : off();
    case 'time':
      return codec.readTime(value, true) ?? off();
    case 'vector':
      return codec.readVector(value) ?? (Array.isArray(value) && value.every((n) => typeof n === 'number') ? [...value] : off());
    case 'json':
      return encodeGeneric(value, codec, path);
    case 'strings':
      return Array.isArray(value) && value.every((v) => typeof v === 'string') ? [...value] : off();
    case 'list':
      return Array.isArray(value) ? value.map((v, i) => encodeField(v, field.of, codec, `${path}[${i}]`) ?? null) : off();
    case 'object': {
      if (!isPlainObject(value)) return off();
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const sub = field.fields[k];
        const e = sub ? encodeField(v, sub, codec, `${path}.${k}`) : encodeGeneric(v, codec, `${path}.${k}`);
        if (e !== undefined) out[k] = e;
      }
      return out;
    }
    case 'map': {
      if (!isPlainObject(value)) return off();
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const e = encodeField(v, field.of, codec, `${path}.${k}`);
        if (e !== undefined) out[k] = e;
      }
      return out;
    }
  }
}

function decodeField(value: unknown, field: Field, codec: StoreCodec): unknown {
  if (value === null || value === undefined) return value;
  // Written generically because it was off its kind (a lenient export).
  if (isTag(value)) return decodeGeneric(value, codec);
  switch (field.kind) {
    case 'time':
      return codec.writeTime(value as Instant, { ordering: field.ordering });
    case 'vector':
      return codec.writeVector(value as number[]);
    case 'json':
      return decodeGeneric(value, codec);
    case 'list':
      return (value as unknown[]).map((v) => decodeField(v, field.of, codec));
    case 'object':
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          field.fields[k] ? decodeField(v, field.fields[k], codec) : decodeGeneric(v, codec),
        ]),
      );
    case 'map':
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, decodeField(v, field.of, codec)]));
    default:
      return Array.isArray(value) ? [...value] : value;
  }
}

/**
 * A stored row as its canonical row `{ _e, _id, _v, …fields }`: the schema's
 * upgrades first (an older shape read as today's), then each field by its
 * kind. Throws `CanonicalMismatchError` (entity, id hash, field path) for a
 * value off its kind, unless lenient.
 */
export function toCanonical(
  entity: string,
  schema: EntitySchema,
  id: string,
  stored: Record<string, unknown>,
  codec: StoreCodec,
  options: ToCanonicalOptions = {},
): ToCanonicalResult {
  const row: Record<string, unknown> = { ...stored };
  for (const upgrade of schema.upgrades ?? []) upgrade.apply(row);
  const out: CanonicalRow = { _e: entity, _id: id, _v: schema.version };
  const offSchema: string[] = [];
  const extras: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (RESERVED.has(key)) throw new TypeError(`${entity} ${idHash(id)}: a stored field named ${key}`);
    const field = schema.fields[key];
    if (!field) {
      extras.push(key);
      const e = encodeGeneric(value, codec, key);
      if (e !== undefined) out[key] = e;
      continue;
    }
    try {
      const e = encodeField(value, field, codec, key);
      if (e !== undefined) out[key] = e;
    } catch (error) {
      if (!(error instanceof OffKind)) throw error;
      if (!options.lenient) throw new CanonicalMismatchError(entity, idHash(id), error.path, error.expected);
      offSchema.push(error.path);
      const e = encodeGeneric(value, codec, key);
      // Wrapped, so reading it back never takes it for its kind.
      if (e !== undefined) out[key] = { $raw: e };
    }
  }
  return { row: out, offSchema, extras: extras.sort() };
}

/** The stored row of a canonical row (its id is `_id`). */
export function fromCanonical(schema: EntitySchema, canonical: CanonicalRow, codec: StoreCodec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(canonical)) {
    if (RESERVED.has(key)) continue;
    const field = schema.fields[key];
    out[key] = field ? decodeField(value, field, codec) : decodeGeneric(value, codec);
  }
  return out;
}

// --- writing it down: one JSON text per row, keys sorted, and its hashes ---

/** JSON with every object's keys sorted (by UTF-16 code unit), no spaces: a row's one text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('A number JSON cannot hold');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const keys = Object.keys(value as object)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

/** Hash of hashes: sha256 of the hex hashes, one per line, in order. */
export function hashOfHashes(hashes: readonly string[]): string {
  const h = createHash('sha256');
  for (const hash of hashes) h.update(`${hash}\n`);
  return h.digest('hex');
}

/** An id as it may be printed: the first 16 hex digits of its sha256 (an id can hold a uid: `{card}_{uid}`). */
export const idHash = (id: string) => sha256(id).slice(0, 16);

/** The id's parity bucket: the first two hex digits of its sha256 (256 buckets, plan §4.4). */
export const bucketOf = (id: string) => sha256(id).slice(0, 2);

/** Ids in the export's order: by their UTF-8 bytes. */
export function compareIds(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Whether a value is an Instant the export writes (re-exported for the adapters' codecs). */
export const isCanonicalInstant = isInstant;

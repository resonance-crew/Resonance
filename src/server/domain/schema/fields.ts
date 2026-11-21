import { z } from 'zod';

/**
 * The canonical storage contract's field kinds (plan §4.1). A storage
 * contract, not the API's: it says how a stored value is written down in an
 * export (`scripts/portability`) and what a PostgreSQL table will hold, so
 * every vendor's adapter converts to and from the same rows.
 *
 * - ids are strings; a subcollection's row id is `<parent id>/<doc id>`.
 * - times are ISO 8601 UTC Instants (`2026-11-20T03:04:05.123456Z`, ports/time.ts),
 *   always six fractional digits so they compare as strings. `instant()` marks a
 *   field something is ordered or paged by: its microseconds are load-bearing
 *   (Firestore's server times have them) and the memory adapter keeps it as an
 *   Instant string; a `time()` is held as a `Date` in memory.
 * - a nested map updated one key at a time (`unread.{uid}`, `reactions.{uid}`)
 *   is a `map(…, { child })`: a child table in a relational store.
 * - an array of ids (`participants`, `userIds`) is a `rel(…)`: a relation.
 * - a vector is `number[]`, beside a string field naming its model (`embedModel`).
 *
 * Firestore never promised a field is present, so every field is optional and
 * may be null; the schema types what is there. Fields a schema doesn't name
 * pass through in the generic encoding (canonical.ts), so nothing is ever
 * dropped — a `complete` entity's extras are listed (names only) in the
 * export's manifest as drift.
 */

export type Field =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'int' }
  | { kind: 'boolean' }
  /** A time; `ordering` when queries order or page by it (microseconds kept, memory holds the Instant string). */
  | { kind: 'time'; ordering: boolean }
  | { kind: 'vector' }
  /** Free-form: any value, in the generic encoding. */
  | { kind: 'json' }
  /** An array of strings; `relation` names what its members are ids of (a relation table in a relational store). */
  | { kind: 'strings'; relation?: string }
  | { kind: 'list'; of: Field }
  | { kind: 'object'; fields: Readonly<Record<string, Field>> }
  /** A map with dynamic keys; `child` names the child table when its keys are updated one at a time. */
  | { kind: 'map'; of: Field; child?: string };

export const f = {
  str: (): Field => ({ kind: 'string' }),
  num: (): Field => ({ kind: 'number' }),
  int: (): Field => ({ kind: 'int' }),
  bool: (): Field => ({ kind: 'boolean' }),
  time: (): Field => ({ kind: 'time', ordering: false }),
  /** A time ordered or paged by. */
  instant: (): Field => ({ kind: 'time', ordering: true }),
  vector: (): Field => ({ kind: 'vector' }),
  json: (): Field => ({ kind: 'json' }),
  strs: (): Field => ({ kind: 'strings' }),
  /** An array of ids of `relation`. */
  rel: (relation: string): Field => ({ kind: 'strings', relation }),
  list: (of: Field): Field => ({ kind: 'list', of }),
  obj: (fields: Record<string, Field>): Field => ({ kind: 'object', fields }),
  map: (of: Field, opts: { child?: string } = {}): Field => ({
    kind: 'map',
    of,
    ...opts,
  }),
};

/** Turns a stored shape into today's before it is written down (plan §4.1: what a backfill did, now on read). */
export interface Upgrade {
  /** What it does, in a sentence. */
  what: string;
  /** The backfill (or reader default) it stands for. */
  source: string;
  apply(row: Record<string, unknown>): void;
}

export interface EntitySchemaDef {
  version: number;
  fields: Readonly<Record<string, Field>>;
  /** What the row id is (`the author's uid`, `<card id>_<uid>`). */
  id: string;
  /** Whether `fields` names everything the code writes; when false the entity is a passthrough. */
  complete: boolean;
  upgrades?: readonly Upgrade[];
}

export interface EntitySchema extends EntitySchemaDef {
  /** The canonical row's contract (without `_e`, `_id`, `_v`); extras pass. */
  zod: z.ZodType<Record<string, unknown>>;
}

/** A generic-encoded value (canonical.ts): JSON, with tagged `{ $time }`, `{ $ref }`, … objects. */
const generic: z.ZodType<unknown> = z.unknown();
const TAG = z
  .object({})
  .catchall(z.unknown())
  .refine((v) => Object.keys(v).length === 1 && Object.keys(v)[0].startsWith('$'));

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function zodOf(field: Field): z.ZodType<unknown> {
  const base = (() => {
    switch (field.kind) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'int':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'time':
        return z.string().regex(INSTANT);
      case 'vector':
        return z.array(z.number());
      case 'json':
        return generic;
      case 'strings':
        return z.array(z.string());
      case 'list':
        return z.array(zodOf(field.of));
      case 'object':
        return z.object(Object.fromEntries(Object.entries(field.fields).map(([k, v]) => [k, zodOf(v)]))).catchall(generic);
      case 'map':
        return z.record(z.string(), zodOf(field.of));
    }
  })();
  // A value off its kind is written in the generic encoding when an export is lenient (a tagged object).
  return z.union([base, TAG]).nullable().optional();
}

export function defineEntity(def: EntitySchemaDef): EntitySchema {
  const shape = Object.fromEntries(Object.entries(def.fields).map(([k, v]) => [k, zodOf(v)]));
  return {
    ...def,
    zod: z.object(shape).catchall(generic) as unknown as z.ZodType<Record<string, unknown>>,
  };
}

/** An entity whose fields aren't typed: every value passes in the generic encoding. */
export function passthrough(version: number, id: string, fields: Record<string, Field> = {}): EntitySchema {
  return defineEntity({ version, id, fields, complete: false });
}

import { describe, expect, it } from 'vitest';
import { ENTITY_NAMES } from '@/server/domain/schema/registry';
import { columnsOf, decode, encode, fromJson, toJson } from './codec';
import { readMigrations } from './migrate';
import { ADAPTER_TABLES, PG_SPECS, PG_TABLES, idOf, keyOf, resolveEntity } from './schema';

// The PostgreSQL schema held to the registry and to its own migrations, with
// no database: every entity has a table, every column the codec writes is in
// that table's DDL, and a document survives the trip to a row and back.

const SQL = readMigrations()
  .map((m) => m.sql)
  .join("\n")
  .replace(/--.*$/gm, "");

/** Each `create table` of the migrations and the column names its body declares. */
function tables(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of SQL.matchAll(/create table (\w+) \(([\s\S]*?)\);\n/g)) {
    const cols = new Set<string>();
    for (const line of m[2].split(/,(?![^(]*\))/)) {
      const name = /^\s*"?(\w+)"?\s+(text|int|bigint|real|boolean|timestamptz|jsonb|vector|text\[\])/.exec(line);
      if (name) cols.add(name[1]);
    }
    out.set(m[1], cols);
  }
  return out;
}

describe('the PostgreSQL schema', () => {
  const ddl = tables();

  it('has a table for every entity of the registry', () => {
    const missing = ENTITY_NAMES.filter((e) => !(e in PG_TABLES) || !ddl.has(PG_SPECS[e].table));
    expect(missing).toEqual([]);
  });

  it("creates every table the codec writes, with each key and typed column it names", () => {
    const problems: string[] = [];
    for (const [entity, spec] of Object.entries(PG_SPECS)) {
      const cols = ddl.get(spec.table);
      if (!cols) {
        problems.push(`${entity}: no table ${spec.table}`);
        continue;
      }
      const needed = [...spec.key.map((k) => k.col), ...Object.values(spec.cols).flatMap((c) => columnsOf(c).map((x) => x.name)), 'extra'];
      for (const col of needed) if (!cols.has(col)) problems.push(`${spec.table}.${col}`);
    }
    for (const t of ADAPTER_TABLES) if (t !== 'schema_migrations' && !ddl.has(t)) problems.push(`no table ${t}`);
    expect(problems).toEqual([]);
  });

  it('keys every deterministic id the services rely on for uniqueness', () => {
    // The ids Firestore made unique by being document ids: each is a primary key here.
    const keyed: [string, string, string[]][] = [
      ['handles', 'ann', ['ann']],
      ['letters', 'w1_r1', ['w1', 'r1']],
      ['resonanceTaps', 'card1_u1', ['card1', 'u1']],
      ['notifications', 'resonance_u1_card1', ['resonance_u1_card1']],
      ['rateLimits', 'u1_chat_image', ['u1', 'chat_image']],
      ['unsentMessages', 'a_b_m1', ['a_b', 'm1']],
      ['messages', 'a_b/m1', ['a_b', 'm1']],
      ['cardVectors', 'c1__insight__2', ['c1', 'insight', '2']],
    ];
    for (const [entity, id, parts] of keyed) {
      expect(keyOf(PG_SPECS[entity], id), entity).toEqual(parts);
      expect(idOf(PG_SPECS[entity], parts)).toBe(id);
    }
    expect(keyOf(PG_SPECS.letters, 'nounderscore')).toBeNull();
    expect(resolveEntity('users/u1/blocks', 'u2')).toEqual({ entity: 'blocks', id: 'u1/u2' });
  });
});

describe('the codec', () => {
  /** A row as pg would hand it back: the typed values (bigint as text, as the pool's parser does) and `extra` parsed. */
  function roundTrip(entity: string, id: string, doc: Record<string, unknown>) {
    const spec = PG_SPECS[entity];
    const e = encode(spec, id, doc, true);
    const row: Record<string, unknown> = { extra: JSON.parse(JSON.stringify(e.extra)) };
    for (const k of e.key) row[k.name] = k.value;
    for (const c of e.cols) row[c.name] = c.cast === 'jsonb' && c.value !== null ? JSON.parse(c.value as string) : c.cast === 'bigint' && c.value !== null ? String(c.value) : c.value;
    return decode(spec, row);
  }

  it('brings a document back as it was written: typed fields, nulls, nested Dates, fields it has no column for', () => {
    const doc = {
      authorId: 'u1',
      visibility: 'public',
      anonymous: true,
      publishedAt: new Date('2026-11-18T10:00:00.123Z'),
      trashedAt: null,
      tags: ['a', 'b'],
      readCount: 3,
      media: { key: 'k', at: new Date('2026-01-01T00:00:00Z'), frame: [1, 2] },
      somethingNew: { deep: [new Date(5)] },
    };
    expect(roundTrip('cards', 'c1', doc)).toEqual({ id: 'c1', doc });
  });

  it('keeps a value its column cannot hold, under its own field', () => {
    const doc = { fromUserId: 'a', toUserId: 'b', status: 'pending', expiresAt: 'not a time' };
    expect(roundTrip('invites', 'i1', doc).doc).toEqual(doc);
    const window = { userId: 'u1', bucket: 'note', windowStart: 1_700_000_000_000, used: 2.5 };
    expect(roundTrip('rateLimits', 'u1_note', window).doc).toEqual(window);
  });

  it('spreads a pair over two columns, and keeps one that is not a sorted pair as written', () => {
    expect(roundTrip('connections', 'a_b', { userIds: ['a', 'b'] }).doc).toEqual({ userIds: ['a', 'b'] });
    expect(roundTrip('connections', 'a_b', { userIds: ['b', 'a', 'c'] }).doc).toEqual({ userIds: ['b', 'a', 'c'] });
  });

  it('reads key fields back from the key, and leaves out one the document never had', () => {
    expect(roundTrip('resonanceTaps', 'c1_u1', { cardId: 'c1', userId: 'u1', on: true }).doc).toEqual({ cardId: 'c1', userId: 'u1', on: true });
    expect(roundTrip('resonanceTaps', 'c1_u1', { on: false }).doc).toEqual({ on: false });
    expect(roundTrip('resonanceTaps', 'c1_u1', { cardId: 'other', userId: 'u1' }).doc).toEqual({ cardId: 'other', userId: 'u1' });
  });

  it('tags Dates inside JSON and untags them, and nothing else', () => {
    const v = { at: new Date(1), list: [new Date(2), { x: 1 }], plain: { $t: 'x', y: 1 } };
    expect(fromJson(JSON.parse(JSON.stringify(toJson(v))))).toEqual(v);
  });
});

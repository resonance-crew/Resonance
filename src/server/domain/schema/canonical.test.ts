import { describe, expect, it } from 'vitest';
import { memoryCodec } from '@/server/infra/memory/canonical';
import { bucketOf, CanonicalMismatchError, canonicalJson, compareIds, fromCanonical, hashOfHashes, idHash, sha256, toCanonical } from './canonical';
import { SPECS } from './registry';

// The canonical rows (plan §4.1–§4.2) on the memory store's values: what a
// stored row becomes, that it decodes back to the same stored row, and the
// hashes the export and the parity check rest on.

const read = (entity: keyof typeof SPECS, id: string, row: Record<string, unknown>, lenient = false) =>
  toCanonical(entity, SPECS[entity].schema, id, row, memoryCodec, { lenient });

describe('canonical rows', () => {
  it('writes times as Instants, upgrades an older card, keeps what the schema does not name', () => {
    const { row, extras } = read('cards', 'c1', {
      authorId: 'u1',
      publishedAt: '2026-11-20T03:04:05.123456Z',
      createdAt: new Date('2026-11-20T03:04:05.120Z'),
      tags: ['a'],
      media: { type: 'image', url: 'https://x/y.webp', frame: { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 } },
      legacyAt: new Date('2026-01-01T00:00:00Z'),
      odd: { $weird: 1 },
      ratio: Number.NaN,
    });
    expect(row).toEqual({
      _e: 'cards',
      _id: 'c1',
      _v: 1,
      authorId: 'u1',
      // An older card without `anonymous` is read as named (scripts/backfills/anonymous.ts).
      anonymous: false,
      publishedAt: '2026-11-20T03:04:05.123456Z',
      createdAt: '2026-11-20T03:04:05.120000Z',
      tags: ['a'],
      media: { type: 'image', url: 'https://x/y.webp', frame: { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 } },
      legacyAt: { $time: '2026-01-01T00:00:00.000000Z' },
      odd: { $obj: { $weird: 1 } },
      ratio: { $num: 'NaN' },
    });
    expect(extras).toEqual(['legacyAt', 'odd', 'ratio']);
    expect(SPECS.cards.schema.zod.safeParse(row).success).toBe(true);
  });

  it('decodes back to the stored row, and reads it again to the same canonical row', () => {
    const stored = {
      senderId: 'u1',
      text: 'hi',
      // A server time's microseconds: kept on an ordering field (memory holds the Instant).
      sentAt: '2026-11-20T03:04:05.123456Z',
      // And on any other time, which memory then holds as the Instant too (a Date has no microseconds).
      unsentAt: '2026-11-20T03:04:06.000001Z',
      reactions: { u2: 'heart' },
      image: { id: 'p', width: 3, height: 4 },
    };
    const first = read('messages', 'pair/m1', stored);
    const back = fromCanonical(SPECS.messages.schema, first.row, memoryCodec);
    expect(back).toEqual(stored);
    expect(canonicalJson(read('messages', 'pair/m1', back).row)).toBe(canonicalJson(first.row));
    const card = read('cards', 'c', { createdAt: new Date('2026-11-20T00:00:00.007Z'), anonymous: true });
    expect(fromCanonical(SPECS.cards.schema, card.row, memoryCodec).createdAt).toEqual(new Date('2026-11-20T00:00:00.007Z'));
    expect(SPECS.messages.schema.zod.safeParse(first.row).success).toBe(true);
  });

  it('refuses a value off its kind by entity, id hash and path — never the value', () => {
    let error: unknown;
    try {
      read('cards', 'card-x_u-secret', { authorId: 42, anonymous: true });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CanonicalMismatchError);
    const message = (error as Error).message;
    expect(message).toContain(idHash('card-x_u-secret'));
    expect(message).toContain('authorId');
    expect(message).not.toContain('42');
    expect(message).not.toContain('u-secret');
  });

  it('when lenient, writes it generically, lists its path, and still decodes to it', () => {
    const stored = { anonymous: 'yes', authorId: 'u1', media: { frame: { cx: 'left' } } };
    const { row, offSchema } = read('cards', 'c1', stored, true);
    expect(offSchema).toEqual(['anonymous', 'media.frame.cx']);
    expect(row.anonymous).toEqual({ $raw: 'yes' });
    expect(fromCanonical(SPECS.cards.schema, row, memoryCodec)).toEqual({ ...stored, publishedAt: null });
  });

  it('refuses a store value it has no word for', () => {
    class Sentinel {}
    expect(() => read('cards', 'c1', { anonymous: false, odd: new Sentinel() })).toThrow(/unknown type/);
  });
});

describe('hashes', () => {
  it('writes one text per row: keys sorted at every depth, no spaces', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: null }], c: 'x' }, u: undefined })).toBe('{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}');
  });

  it('hashes rows, files and entities the same way every time', () => {
    const rows = ['{"_id":"a"}', '{"_id":"b"}'];
    expect(hashOfHashes(rows.map(sha256))).toBe(sha256(`${sha256(rows[0])}\n${sha256(rows[1])}\n`));
    expect(hashOfHashes([])).toBe(sha256(''));
    expect(idHash('x')).toHaveLength(16);
    expect(bucketOf('x')).toMatch(/^[0-9a-f]{2}$/);
  });

  it('orders ids by their UTF-8 bytes', () => {
    expect(['é', 'z', 'a/x', 'a-b/x', 'Z'].sort(compareIds)).toEqual(['Z', 'a-b/x', 'a/x', 'z', 'é']);
  });
});

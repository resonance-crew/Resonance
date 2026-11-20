import { describe, expect, it } from 'vitest';
import { describeCursorContract } from '@/server/contract/time.contract';
import {
  compareInstants,
  decodeCursor,
  encodeCursor,
  instantFromParts,
  instantMillis,
  instantParts,
  isInstant,
  toInstant,
} from './time';

describeCursorContract('c1 (ports/time)', { encode: encodeCursor, decode: decodeCursor });

describe('instants', () => {
  it('are fixed-width UTC with microseconds, so they order as strings', () => {
    const ms = Date.UTC(2026, 10, 20, 3, 4, 5, 123);
    expect(toInstant(ms, 456)).toBe('2026-11-20T03:04:05.123456Z');
    expect(toInstant(new Date(ms))).toBe('2026-11-20T03:04:05.123000Z');
    expect(compareInstants(toInstant(ms, 9), toInstant(ms, 10))).toBe(-1);
    expect(compareInstants(toInstant(ms + 1), toInstant(ms, 999))).toBe(1);
    expect(isInstant('2026-11-20T03:04:05.123Z')).toBe(false);
    expect(isInstant('2026-13-40T03:04:05.123456Z')).toBe(false);
  });

  it("round-trip a Firestore Timestamp's seconds and nanos, below a microsecond dropped", () => {
    const i = instantFromParts(1_763_607_845, 123_456_789);
    expect(i).toBe('2025-11-20T03:04:05.123456Z');
    expect(instantParts(i)).toEqual({ seconds: 1_763_607_845, nanos: 123_456_000 });
    expect(instantMillis(i)).toBe(1_763_607_845_123);
  });

  it('refuse what is not a time', () => {
    expect(() => toInstant(Number.NaN)).toThrow(RangeError);
    expect(() => encodeCursor({ t: 'now', id: 'a' })).toThrow(RangeError);
    expect(() => encodeCursor({ t: '2026-11-20T03:04:05.123456Z', id: '' })).toThrow(RangeError);
  });

  it("leaves the older [seconds, nanos, id] tokens to the cards-read lane's decoder", () => {
    const legacy = Buffer.from(JSON.stringify([1_763_607_845, 123_456_789, 'card'])).toString('base64url');
    expect(decodeCursor(legacy)).toBeNull();
  });
});

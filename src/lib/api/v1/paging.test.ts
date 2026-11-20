import { describe, expect, it } from 'vitest';
import { describeCursorContract } from '@/server/contract/time.contract';
import { afterCursor, encodeCursor } from '@/server/ports/time';
import { encodeNeutralPageToken, encodePageToken, pageTokenPosition, readPageToken } from './paging';
import { ApiFailure } from './http';

// The page token's codec: the neutral `c1.` format and the first `[seconds, nanos, id]` one, read side by side
// forever (clients keep tokens as opaque strings); tokens are still issued in the first (see paging.ts).

describeCursorContract('v1 page tokens (both formats)', { encode: encodeNeutralPageToken, decode: readPageToken });

describe('the first token format', () => {
  const legacy = (seconds: number, nanos: number, id: string) => Buffer.from(JSON.stringify([seconds, nanos, id]), 'utf8').toString('base64url');

  it('is what the server issues, and reads back to the microsecond Firestore kept', () => {
    const token = encodePageToken({ seconds: 1_763_600_000, nanoseconds: 123_456_000 }, 'card1');
    expect(token).toBe(legacy(1_763_600_000, 123_456_000, 'card1'));
    expect(readPageToken(token)).toEqual({ t: '2025-11-20T00:53:20.123456Z', id: 'card1' });
  });

  it('continues exactly where it would have: after its card, never past one sharing its microsecond', () => {
    const t = '2025-11-20T00:53:20.123456Z';
    const old = readPageToken(legacy(1_763_600_000, 123_456_000, 'b'))!;
    // Newest first is the same order reversed: in ascending (t, id), what comes after the boundary.
    const rows = [{ t, id: 'a' }, { t, id: 'b' }, { t, id: 'c' }, { t: '2025-11-20T00:53:20.123457Z', id: 'a' }];
    expect(rows.filter((r) => afterCursor(r, old))).toEqual(rows.slice(2));
    // The same boundary in the new format resumes at the same row.
    const neutral = readPageToken(encodeCursor({ t, id: 'b' }))!;
    expect(rows.filter((r) => afterCursor(r, neutral))).toEqual(rows.slice(2));
  });

  it('refuses what this server never made, as invalid_request on pageToken', () => {
    for (const bad of ['nope', Buffer.from('[1,2]').toString('base64url'), legacy(1, 2, 'a/b'), legacy(1, 1e9, 'a'), legacy(1.5, 0, 'a'), legacy(9e15, 0, 'a'), encodeCursor({ t: '2026-01-01T00:00:00.000000Z', id: 'a/b' })]) {
      let failure: unknown;
      try {
        pageTokenPosition(bad);
      } catch (e) {
        failure = e;
      }
      expect(failure, bad).toBeInstanceOf(ApiFailure);
      expect((failure as ApiFailure).code).toBe('invalid_request');
      expect((failure as ApiFailure).issues?.[0].path).toBe('pageToken');
    }
  });

  it('takes both formats for the same position', () => {
    const position = { t: '2026-11-20T03:04:05.123456Z', id: 'Zx81kQ' };
    const { seconds, nanos } = { seconds: Math.floor(Date.parse('2026-11-20T03:04:05Z') / 1000), nanos: 123_456_000 };
    expect(pageTokenPosition(encodePageToken({ seconds, nanoseconds: nanos }, position.id))).toEqual(position);
    expect(pageTokenPosition(encodeNeutralPageToken(position))).toEqual(position);
  });
});

import { describe, expect, it } from 'vitest';
import { afterCursor, type CursorPosition, type PageCursor } from '@/server/ports/time';

export interface CursorCodec {
  encode(position: CursorPosition): PageCursor;
  decode(cursor: string | null | undefined): CursorPosition | null;
}

/**
 * What any page-cursor codec keeps (ports/time.ts): ports/time's own, and the
 * cards-read lane's decoder that also takes the older `[seconds, nanos, id]`
 * tokens — which must still pass this for the new ones.
 */
export function describeCursorContract(name: string, codec: CursorCodec) {
  describe(`page cursor contract — ${name}`, () => {
    const at = (t: string, id: string): CursorPosition => ({ t, id });

    it('decodes what it encoded, to the microsecond', () => {
      for (const p of [at('2026-11-20T03:04:05.123456Z', 'abc'), at('1999-01-01T00:00:00.000000Z', 'x_y-z'), at('2026-11-20T03:04:05.000001Z', '中文')]) {
        expect(codec.decode(codec.encode(p))).toEqual(p);
      }
    });

    it('is a URL-safe opaque string that names the format', () => {
      const cursor = codec.encode(at('2026-11-20T03:04:05.123456Z', 'card/1?x'));
      expect(cursor.startsWith('c1.')).toBe(true);
      expect(cursor).toMatch(/^[A-Za-z0-9._-]+$/);
    });

    it('never skips the rows that share a microsecond: the id breaks the tie', () => {
      const t = '2026-11-20T03:04:05.123456Z';
      const rows = [at(t, 'a'), at(t, 'b'), at(t, 'c'), at('2026-11-20T03:04:05.123457Z', 'a')];
      const cursor = codec.decode(codec.encode(rows[0]))!;
      expect(rows.filter((r) => afterCursor(r, cursor))).toEqual(rows.slice(1));
    });

    it('answers null for what it cannot read', () => {
      for (const bad of [null, undefined, '', 'c1.', 'c1.!!!', 'c1.' + Buffer.from('{"t":"yesterday","id":"a"}').toString('base64url'), 'c1.' + Buffer.from('{"t":"2026-11-20T03:04:05.123456Z","id":""}').toString('base64url'), 'c1.' + Buffer.from('[1,2]').toString('base64url'), 'zz.abc']) {
        expect(codec.decode(bad)).toBeNull();
      }
    });
  });
}

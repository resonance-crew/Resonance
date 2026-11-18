import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { LIMITS } from '@/lib/api/rateLimit';
import { readSeconds } from '@/lib/readTime';
import {
  ACTIVE_SLACK_SECONDS,
  DAYS_KEPT,
  REPORTS_PER_CARD_DAY,
  REREAD_GAP_MS,
  SESSIONS_KEPT,
  SIGNAL_KEEP_DAYS,
  foldReading,
  reportReading,
  type SignalState,
} from './reading';

// Reading reports (round 26 §R3): a page view's running totals, never deltas —
// the largest each session said, sessions added up —, clamped, at most 20 a
// card a day; "read to the end" only with the time for it (a short card whose
// end shows at once isn't read before 0.4 of its reading time); a re-read is a
// session coming back 12 hours on and reading 0.3 of the way. Kept only for a
// reader who may read the card and didn't write it, never across a block on a
// named card, and never naming anyone.

const NOW = Date.parse('2026-11-19T10:00:00Z');
const HOUR = 3600_000;
const report = (session: string, activeSeconds: number, progress: number, reachedEnd = false, shared?: boolean) => ({
  session,
  activeSeconds,
  progress,
  reachedEnd,
  ...(shared === undefined ? {} : { shared }),
});

/** Reports folded one after another, each at its time. */
function fold(steps: [ReturnType<typeof report>, number][], expected = 120): SignalState | null {
  let state: SignalState | null = null;
  for (const [r, at] of steps) state = foldReading(state, r, at, expected) ?? state;
  return state;
}

describe('foldReading', () => {
  it("keeps each session's running totals — sent twice or out of order they count once — and adds sessions up", () => {
    const s = fold([
      [report('view-0001', 30, 0.4), NOW],
      [report('view-0001', 50, 0.6), NOW + 20_000],
      // A late copy of an earlier report: nothing moves back.
      [report('view-0001', 30, 0.4), NOW + 25_000],
      [report('view-0002', 20, 0.9), NOW + HOUR],
    ])!;
    expect(s.activeSeconds).toBe(70);
    expect(s.maxProgress).toBe(0.9);
    expect(s.sessions.map((x) => [x.id, x.active, x.progress])).toEqual([['view-0001', 50, 0.6], ['view-0002', 20, 0.9]]);
    expect(s.firstAt).toBe(NOW);
    expect(s.lastAt).toBe(NOW + HOUR);
    expect(s.days).toEqual(['2026-11-19']);
  });

  it('clamps what a client says: progress to 0…1, seconds to three reading times plus ten minutes', () => {
    const s = fold([[report('view-0001', 99_999, 3), NOW], [report('view-0002', -5, -1), NOW + 1]], 100)!;
    expect(s.activeSeconds).toBe(100 * 3 + ACTIVE_SLACK_SECONDS);
    expect(s.maxProgress).toBe(1);
    expect(s.sessions[1]).toMatchObject({ active: 0, progress: 0 });
    expect(foldReading(null, report('view-0003', Number.NaN, Number.NaN), NOW, 100)).toMatchObject({ activeSeconds: 0, maxProgress: 0 });
  });

  it("doesn't call a short card read to the end before 0.4 of its reading time, whatever its end in view says", () => {
    // 20 seconds to read: the end shows at once.
    const early = fold([[report('view-0001', 5, 1, true), NOW]], 20)!;
    expect(early.reachedEndAt).toBeNull();
    const enough = fold([[report('view-0001', 5, 1, true), NOW], [report('view-0001', 8, 1, true), NOW + 10_000]], 20)!;
    expect(enough.reachedEndAt).toBe(NOW + 10_000);
    // The end seen once stays seen in that session (running totals): the time catching up later still reads it.
    const later = fold([[report('view-0001', 2, 1, true), NOW], [report('view-0001', 9, 1, false), NOW + 10_000]], 20)!;
    expect(later.reachedEndAt).toBe(NOW + 10_000);
  });

  it('counts a re-read once per session that comes back 12 hours or more on and reads 0.3 of the way — never the first', () => {
    const first = [report('view-0001', 100, 1, true), NOW] as [ReturnType<typeof report>, number];
    expect(fold([first])!.rereads).toBe(0);
    // Back within 12 hours: no re-read, however far.
    expect(fold([first, [report('view-0002', 100, 1), NOW + REREAD_GAP_MS - 1]])!.rereads).toBe(0);
    const back = fold([
      first,
      [report('view-0002', 10, 0.2), NOW + 15 * HOUR],
      [report('view-0002', 30, 0.35), NOW + 15 * HOUR + 60_000],
      [report('view-0002', 60, 0.8), NOW + 15 * HOUR + 120_000],
    ])!;
    expect(back.rereads).toBe(1);
    expect(back.rereadAt).toBe(NOW + 15 * HOUR + 60_000);
    expect(back.days).toEqual(['2026-11-19', '2026-11-20']);
  });

  it(`keeps at most ${REPORTS_PER_CARD_DAY} reports a card a UTC day, the last ${SESSIONS_KEPT} sessions and ${DAYS_KEPT} days; a share stays shared`, () => {
    let s: SignalState | null = null;
    for (let i = 0; i < REPORTS_PER_CARD_DAY; i++) s = foldReading(s, report(`view-${String(i).padStart(4, '0')}`, 1, 0.1, false, i === 3), NOW + i, 60);
    expect(s!.reportsToday).toBe(REPORTS_PER_CARD_DAY);
    expect(foldReading(s, report('view-9999', 1, 0.1), NOW + 100, 60)).toBeNull();
    const next = foldReading(s, report('view-9999', 1, 0.1), NOW + 24 * HOUR, 60)!;
    expect(next.reportsToday).toBe(1);
    expect(next.sessions).toHaveLength(SESSIONS_KEPT);
    expect(next.shared).toBe(true);
    let days: SignalState | null = null;
    for (let d = 0; d < DAYS_KEPT + 5; d++) days = foldReading(days, report(`day-${String(d).padStart(4, '0')}`, 1, 0.1), NOW + d * 24 * HOUR, 60);
    expect(days!.days).toHaveLength(DAYS_KEPT);
    expect(days!.days[0]).toBe('2026-11-24');
  });
});

describe('reportReading', () => {
  const at = Timestamp.fromMillis(NOW - 7 * 24 * HOUR);
  const STORY = '雨停的時候，巷口的積水映出整排路燈。'.repeat(20);
  const card = (extra: Record<string, unknown> = {}) => ({
    authorId: 'alice', thoughtCore: 'A walk', story: STORY, tags: [], visibility: 'public', anonymous: false, publishedAt: at, ...extra,
  });
  const world = (more: Record<string, Record<string, unknown>> = {}) =>
    fakeAdminDb({
      'cards/c1': card(),
      'cards/anon': card({ anonymous: true }),
      'cards/draft': card({ publishedAt: null }),
      'cards/priv': card({ visibility: 'private' }),
      'cards/trashed': card({ visibility: 'private', trashedAt: Timestamp.fromMillis(NOW - HOUR) }),
      'cards/conn': card({ visibility: 'connections' }),
      ...more,
    });
  const r = report('view-0001', 90, 1, true);

  it("keeps a reader's report, by the server's clock, for 180 days after their last read — naming no author", async () => {
    const { db, docs } = world();
    expect(await reportReading(db, 'bob', 'c1', r, NOW)).toBe(true);
    const kept = docs['readerSignals/bob_c1'];
    expect(kept).toMatchObject({ userId: 'bob', cardId: 'c1', activeSeconds: 90, maxProgress: 1, rereads: 0, shared: false });
    expect(kept.reachedEndAt).toEqual(Timestamp.fromMillis(NOW));
    expect((kept.expireAt as Timestamp).toMillis()).toBe(NOW + SIGNAL_KEEP_DAYS * 24 * HOUR);
    expect(Object.keys(kept)).not.toContain('authorId');
    // Read to the end needs 0.4 of the story's reading time: this one's is readSeconds(story).
    expect(90).toBeGreaterThanOrEqual(readSeconds(STORY) * 0.4);
  });

  it("keeps nothing of its author's reading, nor of a card the reader couldn't open", async () => {
    const { db, docs } = world();
    expect(await reportReading(db, 'alice', 'c1', r, NOW)).toBe(false);
    for (const id of ['draft', 'priv', 'trashed', 'conn', 'missing']) expect(await reportReading(db, 'bob', id, r, NOW), id).toBe(false);
    expect(Object.keys(docs).some((p) => p.startsWith('readerSignals/'))).toBe(false);
    docs['connections/alice_bob'] = { userIds: ['alice', 'bob'] };
    expect(await reportReading(db, 'bob', 'conn', r, NOW)).toBe(true);
  });

  for (const block of [null, 'users/bob/blocks/alice', 'users/alice/blocks/bob']) {
    it(`keeps an anonymous card's report ${block ? `across a block (${block})` : 'without a block'}, a named one's only without`, async () => {
      const { db } = world(block ? { [block]: { blockedUid: 'x' } } : {});
      expect(await reportReading(db, 'bob', 'anon', r, NOW)).toBe(true);
      expect(await reportReading(db, 'bob', 'c1', r, NOW)).toBe(!block);
    });
  }

  it("goes unkept past the reader's daily budget, quietly, spending nothing for a card whose day is full", async () => {
    const { db, docs } = world({
      'rateLimits/bob_readReport': { userId: 'bob', bucket: 'readReport', windowStart: NOW - 1000, used: LIMITS.readReport.max },
    });
    expect(await reportReading(db, 'bob', 'c1', r, NOW)).toBe(false);
    expect(docs['readerSignals/bob_c1']).toBeUndefined();
    docs['rateLimits/bob_readReport'].used = 0;
    docs['readerSignals/bob_c1'] = { userId: 'bob', cardId: 'c1', reportDay: '2026-11-19', reportsToday: REPORTS_PER_CARD_DAY };
    expect(await reportReading(db, 'bob', 'c1', r, NOW)).toBe(false);
    expect(docs['rateLimits/bob_readReport'].used).toBe(0);
  });
});

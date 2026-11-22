import { describe, expect, it } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '../../../test/fakeAdminDb';
import { BELL_READ_SUMMARY_CAPABILITY, READ_SUMMARY_MIN, WEEK_MS, readSummaryId, runReadSummary, weekTally } from './readSummary';
import { pushText } from './send';

// The weekly read summary (round 26 §R4) on a fake clock: the distinct
// readers — never the author — who read a card to the end in the seven days
// before the run; three or more, one bell row for its author, already pushed
// (a bell row only), no names; fewer, nothing. Gated like the tap's row on
// the author's app builds, written once a run's day.

// A Monday, 01:00 UTC (09:00 in Taipei): when the cron runs.
const MONDAY = Date.parse('2026-11-23T01:00:00Z');
const DAY = 24 * 3600_000;
const read = (cardId: string, userId: string, endedDaysAgo: number, rereadDaysAgo: number | null = null) => ({
  [`readerSignals/${userId}_${cardId}`]: {
    userId,
    cardId,
    reachedEndAt: Timestamp.fromMillis(MONDAY - endedDaysAgo * DAY),
    rereadAt: rereadDaysAgo === null ? null : Timestamp.fromMillis(MONDAY - rereadDaysAgo * DAY),
  },
});
const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId, thoughtCore: 't', story: 's', visibility: 'public', anonymous: false, publishedAt: Timestamp.fromMillis(MONDAY - 30 * DAY), ...extra,
});

describe('weekTally', () => {
  it('counts each card\'s distinct readers in the seven days before the run — not one at its edge — and whether one came back', () => {
    const reads = [
      { cardId: 'a', userId: 'r1', reachedEndAt: MONDAY - 1, rereadAt: null },
      { cardId: 'a', userId: 'r1', reachedEndAt: MONDAY - 2, rereadAt: null },
      { cardId: 'a', userId: 'r2', reachedEndAt: MONDAY - WEEK_MS, rereadAt: MONDAY - 3 * DAY },
      // Just before the week, and just at its end: neither counts.
      { cardId: 'a', userId: 'r3', reachedEndAt: MONDAY - WEEK_MS - 1, rereadAt: null },
      { cardId: 'a', userId: 'r4', reachedEndAt: MONDAY, rereadAt: null },
      // A re-read before the week says nothing of this one.
      { cardId: 'b', userId: 'r1', reachedEndAt: MONDAY - DAY, rereadAt: MONDAY - 10 * DAY },
    ];
    expect(Object.fromEntries(weekTally(reads, MONDAY))).toEqual({ a: { readers: 2, reread: true }, b: { readers: 1, reread: false } });
  });
});

describe('runReadSummary', () => {
  const world = (more: Record<string, Record<string, unknown>> = {}) =>
    fakeAdminDb({
      'cards/walk': card('bob'),
      'cards/masked': card('bob', { anonymous: true }),
      'cards/trashed': card('bob', { visibility: 'private', trashedAt: Timestamp.fromMillis(MONDAY - DAY) }),
      'cards/few': card('carol'),
      ...read('walk', 'r1', 1, 2),
      ...read('walk', 'r2', 3),
      ...read('walk', 'r3', 6),
      ...read('walk', 'old', 9),
      ...read('masked', 'r1', 1),
      ...read('masked', 'r2', 2),
      ...read('masked', 'r3', 2),
      ...read('trashed', 'r1', 1),
      ...read('trashed', 'r2', 1),
      ...read('trashed', 'r3', 1),
      ...read('few', 'r1', 1),
      ...read('few', 'r2', 1),
      ...more,
    });

  it(`writes the author one row, already pushed and naming no one, for a card ${READ_SUMMARY_MIN} or more read to the end — nothing for fewer`, async () => {
    const { db, docs } = world();
    expect(await runReadSummary(db, { now: MONDAY })).toEqual({ cards: 4, rows: 2, held: 0, late: 0 });
    expect(readSummaryId('walk', MONDAY)).toBe('rsum_walk_20261123');
    expect(docs['notifications/rsum_walk_20261123']).toEqual({
      userId: 'bob',
      type: 'read_summary',
      payload: { cardId: 'walk', readers: 3, reread: true },
      readAt: null,
      createdAt: Timestamp.fromMillis(MONDAY),
      pushedAt: Timestamp.fromMillis(MONDAY),
      // The commit's own time, the bell's change stamps (repos/bell BELL_EDITED_AT, BELL_MADE_AT).
      editedAt: FieldValue.serverTimestamp(),
      madeAt: FieldValue.serverTimestamp(),
    });
    expect(docs['notifications/rsum_masked_20261123'].payload).toEqual({ cardId: 'masked', readers: 3, reread: false, anonymous: true });
    // A card in the trash, and one only two read to the end: nothing.
    expect(Object.keys(docs).filter((p) => p.startsWith('notifications/')).sort()).toEqual(['notifications/rsum_masked_20261123', 'notifications/rsum_walk_20261123']);
    // What the bell says, in either language.
    expect(pushText('zh-TW', 'read_summary', { readers: 3 })).toEqual({ title: '上週有 3 個人把這張卡讀到最後' });
  });

  it("never counts the author's own reading, writes once a day however often it runs, and holds the row from an older app build", async () => {
    const own = world({ ...read('few', 'carol', 1) });
    expect((await runReadSummary(own.db, { now: MONDAY })).rows).toBe(2);
    expect(own.docs['notifications/rsum_few_20261123']).toBeUndefined();
    expect((await runReadSummary(own.db, { now: MONDAY + 3600_000 })).rows).toBe(0);
    const old = world({ 'devices/d1': { userId: 'bob', token: 't', platform: 'ios', capabilities: ['chat-push'] } });
    expect(await runReadSummary(old.db, { now: MONDAY })).toEqual({ cards: 4, rows: 0, held: 2, late: 0 });
    const fresh = world({ 'devices/d1': { userId: 'bob', token: 't', platform: 'ios', capabilities: [BELL_READ_SUMMARY_CAPABILITY] } });
    expect((await runReadSummary(fresh.db, { now: MONDAY })).rows).toBe(2);
  });

  it("writes nothing for a card for connections only, or private by now — three of the author's few connections would be named by their count", async () => {
    const three = (cardId: string) => ({ ...read(cardId, 'r1', 1), ...read(cardId, 'r2', 2), ...read(cardId, 'r3', 3) });
    const { db, docs } = fakeAdminDb({
      'cards/open': card('bob'),
      'cards/close': card('bob', { visibility: 'connections' }),
      'cards/hidden': card('bob', { visibility: 'private' }),
      // r1, r2 and r3 are all of bob's connections.
      'connections/bob_r1': { userIds: ['bob', 'r1'] },
      'connections/bob_r2': { userIds: ['bob', 'r2'] },
      'connections/bob_r3': { userIds: ['bob', 'r3'] },
      ...three('open'),
      ...three('close'),
      ...three('hidden'),
    });
    expect(await runReadSummary(db, { now: MONDAY })).toEqual({ cards: 3, rows: 1, held: 0, late: 0 });
    expect(Object.keys(docs).filter((p) => p.startsWith('notifications/'))).toEqual(['notifications/rsum_open_20261123']);
    expect(docs['notifications/rsum_open_20261123'].payload).toEqual({ cardId: 'open', readers: 3, reread: false });
  });

  it('starts nothing past its deadline', async () => {
    const { db, docs } = world();
    expect(await runReadSummary(db, { now: MONDAY, deadline: MONDAY, clock: () => MONDAY })).toEqual({ cards: 4, rows: 0, held: 0, late: 3 });
    expect(Object.keys(docs).some((p) => p.startsWith('notifications/'))).toBe(false);
  });
});

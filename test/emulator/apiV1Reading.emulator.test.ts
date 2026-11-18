import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { REPORTS_PER_CARD_DAY, SIGNAL_KEEP_DAYS, reportReading } from '@/lib/api/v1/reading';

// Reading reports (round 26 §R3) against the Firestore emulator: a page
// view's running totals kept once however often — or however concurrently —
// they are sent, sessions added up, a re-read counted, the record's TTL date
// 180 days past the last read; never its author's reading, never a card the
// reader can't open, never a named card across a block either way (an
// anonymous one whoever was blocked); at most 20 reports a card a day.

const PROJECT = 'demo-resonance-reading';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'reading-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const NOW = Date.UTC(2026, 10, 19, 10);
const HOUR = 3600_000;
const at = Timestamp.fromMillis(NOW - 7 * 24 * HOUR);
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'alice', thoughtCore: 't', story: '雨停的時候，巷口的積水映出整排路燈。'.repeat(10), tags: [], visibility: 'public',
    anonymous: false, publishedAt: at, readCount: 0, resonanceCount: 0, ...extra,
  });
const report = (session: string, activeSeconds: number, progress: number, reachedEnd = false) => ({ session, activeSeconds, progress, reachedEnd });
const record = async (path: string) => (await db.doc(path).get()).data();

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

describe('reportReading', () => {
  it("keeps a page view's running totals once, however many copies arrive at once, and adds the sessions up", async () => {
    await card('c1');
    const sent = await Promise.all([1, 2, 3].map(() => reportReading(db, 'bob', 'c1', report('view-0001', 40, 0.7), NOW)));
    expect(sent.every(Boolean)).toBe(true);
    await reportReading(db, 'bob', 'c1', report('view-0001', 55, 1, true), NOW + 60_000);
    await reportReading(db, 'bob', 'c1', report('view-0002', 20, 0.5), NOW + 15 * HOUR);
    const kept = (await record('readerSignals/bob_c1'))!;
    expect(kept).toMatchObject({ userId: 'bob', cardId: 'c1', activeSeconds: 75, maxProgress: 1, rereads: 1, days: ['2026-11-19', '2026-11-20'] });
    expect(kept.reachedEndAt.toMillis()).toBe(NOW + 60_000);
    expect(kept.expireAt.toMillis()).toBe(NOW + 15 * HOUR + SIGNAL_KEEP_DAYS * 24 * HOUR);
    expect(kept.sessions.map((s: { id: string }) => s.id)).toEqual(['view-0001', 'view-0002']);
    // The card's own read count is POST …/read's, never this.
    expect((await record('cards/c1'))!.readCount).toBe(0);
  });

  it("keeps nothing of its author's reading, a draft, a private card, one in the trash, or a stranger's connections card", async () => {
    await Promise.all([
      card('mine'),
      card('draft', { publishedAt: null }),
      card('priv', { visibility: 'private' }),
      card('trashed', { visibility: 'private', trashedAt: Timestamp.fromMillis(NOW - HOUR) }),
      card('conn', { visibility: 'connections' }),
    ]);
    expect(await reportReading(db, 'alice', 'mine', report('view-0001', 30, 1, true), NOW)).toBe(false);
    for (const id of ['draft', 'priv', 'trashed', 'conn', 'missing']) expect(await reportReading(db, 'bob', id, report('view-0001', 30, 1), NOW), id).toBe(false);
    expect((await db.collection('readerSignals').get()).empty).toBe(true);
  });

  for (const block of [null, 'users/bob/blocks/alice', 'users/alice/blocks/bob']) {
    it(`keeps an anonymous card's reading ${block ? `across a block (${block})` : 'without a block'}, a named one's only without`, async () => {
      await Promise.all([card('anon', { anonymous: true }), card('named')]);
      if (block) await db.doc(block).set({ createdAt: at });
      expect(await reportReading(db, 'bob', 'anon', report('view-0001', 30, 1), NOW)).toBe(true);
      expect(await reportReading(db, 'bob', 'named', report('view-0001', 30, 1), NOW)).toBe(!block);
    });
  }

  it(`keeps at most ${REPORTS_PER_CARD_DAY} reports of one card a day, and the next day again`, async () => {
    await card('c1');
    for (let i = 0; i < REPORTS_PER_CARD_DAY; i++) expect(await reportReading(db, 'bob', 'c1', report(`view-${String(i).padStart(4, '0')}`, 1, 0.1), NOW + i)).toBe(true);
    expect(await reportReading(db, 'bob', 'c1', report('view-9999', 1, 0.1), NOW + 100)).toBe(false);
    expect(await reportReading(db, 'bob', 'c1', report('view-9999', 1, 0.1), NOW + 24 * HOUR)).toBe(true);
  });
});

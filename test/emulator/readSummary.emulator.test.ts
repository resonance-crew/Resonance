import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { reportReading } from '@/lib/api/v1/reading';
import { registerDevice } from '@/lib/push/devices';
import { BELL_READ_SUMMARY_CAPABILITY, runReadSummary } from '@/lib/push/readSummary';

// The weekly read summary (round 26 §R4) against the Firestore emulator — its
// range query on reachedEndAt answered by a single-field index
// (test/emulator/indexGuard refuses one production would) —: readers' records
// made through the reading reports themselves, three of them in the week for
// a bell row naming no one, written already pushed, once a run's day.

const PROJECT = 'demo-resonance-read-summary';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'read-summary-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

// A Monday, 01:00 UTC: when the cron runs.
const MONDAY = Date.UTC(2026, 10, 23, 1);
const DAY = 86_400_000;
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'alice', thoughtCore: 't', story: 'A short story about the rain.', tags: [], visibility: 'public', anonymous: false,
    publishedAt: Timestamp.fromMillis(MONDAY - 30 * DAY), ...extra,
  });
const readToEnd = (uid: string, cardId: string, at: number) =>
  reportReading(db, uid, cardId, { session: `view-${uid}-${at}`, activeSeconds: 60, progress: 1, reachedEnd: true }, at);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

describe('runReadSummary', () => {
  it("rings no phone and names no one: a row for a card three readers read to the end in the week, none for two, none for last week's", async () => {
    await Promise.all([card('walk'), card('masked', { anonymous: true }), card('quiet')]);
    for (const uid of ['bob', 'carol', 'dora']) expect(await readToEnd(uid, 'walk', MONDAY - 2 * DAY)).toBe(true);
    for (const uid of ['bob', 'carol', 'dora']) await readToEnd(uid, 'masked', MONDAY - 9 * DAY);
    for (const uid of ['bob', 'carol']) await readToEnd(uid, 'quiet', MONDAY - DAY);
    // dora came back the next day and read it again.
    await reportReading(db, 'dora', 'walk', { session: 'view-dora-back', activeSeconds: 30, progress: 0.6, reachedEnd: false }, MONDAY - DAY);
    expect(await runReadSummary(db, { now: MONDAY })).toEqual({ cards: 2, rows: 1, held: 0, late: 0 });
    const rows = (await db.collection('notifications').get()).docs;
    expect(rows.map((d) => d.id)).toEqual(['rsum_walk_20261123']);
    expect(rows[0].data()).toMatchObject({ userId: 'alice', type: 'read_summary', payload: { cardId: 'walk', readers: 3, reread: true }, readAt: null });
    expect(rows[0].get('pushedAt')).not.toBeNull();
    expect(JSON.stringify(rows[0].data())).not.toMatch(/bob|carol|dora/);
    // Once a run's day.
    expect((await runReadSummary(db, { now: MONDAY + 3600_000 })).rows).toBe(0);
  });

  it('asks once per author whether their apps draw the row, however many of their cards are due (B17)', async () => {
    await Promise.all([card('a1'), card('a2'), card('a3')]);
    for (const id of ['a1', 'a2', 'a3']) for (const uid of ['bob', 'carol', 'dora']) await readToEnd(uid, id, MONDAY - DAY);
    const collection = vi.spyOn(db, 'collection');
    try {
      expect(await runReadSummary(db, { now: MONDAY })).toMatchObject({ rows: 3, held: 0 });
      expect(collection.mock.calls.filter(([path]) => path === 'devices')).toHaveLength(1);
    } finally {
      collection.mockRestore();
    }
  });

  it('marks an anonymous card\'s row so, and holds it from an author whose app build would draw its type raw', async () => {
    await card('masked', { anonymous: true });
    for (const uid of ['bob', 'carol', 'dora']) await readToEnd(uid, 'masked', MONDAY - DAY);
    await registerDevice(db, 'alice', 'install-old-0001', { token: 'old', platform: 'ios', locale: 'zh-TW', capabilities: [] });
    expect(await runReadSummary(db, { now: MONDAY })).toMatchObject({ rows: 0, held: 1 });
    await registerDevice(db, 'alice', 'install-old-0001', { token: 'old', platform: 'ios', locale: 'zh-TW', capabilities: [BELL_READ_SUMMARY_CAPABILITY] });
    expect(await runReadSummary(db, { now: MONDAY })).toMatchObject({ rows: 1, held: 0 });
    expect((await db.doc('notifications/rsum_masked_20261123').get()).get('payload')).toEqual({ cardId: 'masked', readers: 3, reread: false, anonymous: true });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';

// Round 26 §A3 against the Firestore emulator: a reader's own acts — the cards they replied to, noted, tapped,
// saved and read, and the picks they were shown — read from where each is kept, weigh their taste, and their picks
// follow it; an anonymous card's signals feed the content taste alone; a cold start doesn't turn on a connection's
// anonymous card; what was shown is counted only on days the reader opened their picks. No model is asked: the
// funnel's LLM steps fail and its fallback order — the taste's — is what is read.

const mocks = vi.hoisted(() => ({ store: null as IVectorStore | null, db: null as Firestore | null }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/ai/openai', async (original) => ({
  ...(await original<typeof import('@/lib/ai/openai')>()),
  chatJSON: async () => {
    throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  },
}));

const { recommendFeed } = await import('@/lib/recommend/funnel');
const { dailyRecommendations, warmRecommendations } = await import('@/lib/recommend/daily');
const { FirestoreVectorStore } = await import('@/lib/recommend/vectorStore/firestore');
const { buildUserProfile } = await import('@/lib/recommend/profile');

const PROJECT = 'demo-resonance-recommend-signals';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'recommend-signals-test');
  db = getFirestore(app);
  mocks.db = db;
  mocks.store = new FirestoreVectorStore(db);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const DIM = 12;
const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const axis = (i: number, nudge = 0) => unit(Array.from({ length: DIM }, (_, k) => (k === i ? 1 : k === (i + 1) % DIM ? nudge : 0)));
const now = Timestamp.now();
const shown = { visibility: 'public', anonymous: false, publishedAt: now, thoughtCore: 't', story: 'words' };

/** A public card with one insight part, as indexCard leaves it under the emulators (embedModel `offline`). */
async function card(id: string, authorId: string, vector: number[], extra: Record<string, unknown> = {}) {
  await db.doc(`cards/${id}`).set({ authorId, ...shown, ...extra });
  await mocks.store!.upsert([
    { cardId: id, authorId, visibility: 'public', channel: 'insight', part: 0, vector, embedModel: 'offline', insightScore: 0.8, coreInsight: `insight ${id}`, situation: '', lifeDomain: 'x', span: '' },
  ]);
}

/** The pool: cards on several directions, two near each of the ones the reader acts on. */
async function pool() {
  await Promise.all([
    card('replied', 'pat', axis(0)),
    card('nearReplied', 'quin', axis(0, 0.05)),
    card('left', 'ray', axis(4)),
    card('nearLeft', 'sam', axis(4, 0.05)),
    card('tappedAnon', 'tia', axis(8), { anonymous: true }),
    card('nearTapped', 'uma', axis(8, 0.05)),
    card('tiaNamed', 'tia', axis(8, 0.06)),
    ...[2, 6, 10].map((i) => card(`spread${i}`, `w${i}`, axis(i))),
  ]);
}
const ids = (r: { items: { cardId: string }[] }) => r.items.map((i) => i.cardId);

describe("the reader's acts in their taste", () => {
  it('picks near what they replied to and tapped, away from what they opened and left, and never what they acted on', async () => {
    await pool();
    await Promise.all([
      db.doc('cards/myReply').set({ authorId: 'alice', ...shown, referenceCardId: 'replied' }),
      db.doc('resonanceTaps/tappedAnon_alice').set({ cardId: 'tappedAnon', userId: 'alice', on: true, at: now }),
      db.doc('readerSignals/alice_left').set({ userId: 'alice', cardId: 'left', lastAt: now, reachedEndAt: null, rereads: 0, activeSeconds: 3, maxProgress: 0.02 }),
      db.doc('notes/n1').set({ cardId: 'spread2', fromUserId: 'alice', toUserId: 'w2', text: 'NOTE-TEXT', createdAt: now }),
    ]);
    const first = await recommendFeed('alice', { fallback: true });
    const got = ids(first);
    expect(got.slice(0, 2).sort()).toEqual(['nearReplied', 'nearTapped']);
    for (const id of ['replied', 'tappedAnon', 'left', 'spread2', 'myReply']) expect(got).not.toContain(id);
    // What she opened and left counts against what is near it: without that record, its neighbour stands higher.
    const scoreOf = (r: typeof first, id: string) => r.items.find((i) => i.cardId === id)?.score ?? -Infinity;
    await db.doc('readerSignals/alice_left').delete();
    const second = await recommendFeed('alice', { fallback: true });
    expect(scoreOf(second, 'nearLeft')).toBeGreaterThan(scoreOf(first, 'nearLeft'));
  });

  it("feeds an anonymous card's tap to the content taste only: its author's named card is lifted by nearness, never by who wrote it", async () => {
    await pool();
    await db.doc('resonanceTaps/tappedAnon_alice').set({ cardId: 'tappedAnon', userId: 'alice', on: true, at: now });
    const { items } = await recommendFeed('alice', { fallback: true });
    const score = (id: string) => items.find((i) => i.cardId === id)?.score ?? null;
    // tiaNamed is a touch further than nearTapped, and nothing lifts it for being tia's.
    expect(score('nearTapped')).not.toBeNull();
    expect(score('tiaNamed')!).toBeLessThan(score('nearTapped')!);
    expect(score('tiaNamed')!).toBeLessThan(score('nearTapped')! + 0.1);
  });

  it('takes a tap back with its weight: the taste forgets it, and the card is still not shown again', async () => {
    await pool();
    await db.doc('resonanceTaps/tappedAnon_alice').set({ cardId: 'tappedAnon', userId: 'alice', on: false, at: now });
    const p = await buildUserProfile('alice', { db });
    expect(p.taste.positive).toEqual([]);
    expect(p.held.has('tappedAnon')).toBe(true);
  });
});

describe('a cold start', () => {
  it("is the same with a connection whose card is anonymous as without that connection (§V2)", async () => {
    await pool();
    await card('friendAnon', 'fay', axis(3), { anonymous: true });
    const without = ids(await recommendFeed('newbie'));
    await db.doc('connections/fay_newbie').set({ userIds: ['fay', 'newbie'], establishedAt: now });
    const withFriend = await recommendFeed('newbie');
    expect(withFriend.coldStart).toBe(true);
    expect(ids(withFriend)).toEqual(without);
    // A named card of theirs comes first.
    await card('friendNamed', 'fay', axis(3, 0.2));
    expect(ids(await recommendFeed('newbie'))[0]).toBe('friendNamed');
  });
});

describe('what the reader was shown', () => {
  const ref = () => db.doc('recommendations/alice');
  const item = (cardId: string) => ({ cardId, channel: 'insight' as const, reason: '', score: 1 });

  it('counts the picks a reader is answered with once a day, never a warm build nobody saw, and holds back one shown three times unopened', async () => {
    const day = (d: string) => () => Date.parse(`${d}T09:00:00Z`);
    await ref().set({ date: '2026-11-16', items: [item('ignored'), item('opened')] });
    for (const d of ['2026-11-17', '2026-11-18', '2026-11-19']) {
      const served = await dailyRecommendations(db, 'alice', { now: day(d), build: async () => ({ items: [item('ignored'), item('opened')], partial: false }) });
      await served.asked?.();
      // A second ask the same day counts nothing more.
      await (await dailyRecommendations(db, 'alice', { now: day(d), build: async () => ({ items: [], partial: false }) })).asked?.();
      await ref().update({ date: '2026-11-16' });
    }
    // The warm-up's build, which the reader never saw.
    await warmRecommendations(db, 'alice', { now: day('2026-11-20'), build: async () => ({ items: [item('ignored')], partial: false }) });
    const stored = (await ref().get()).data()!;
    expect(stored.shown.ignored).toEqual({ n: 3, lastDay: '2026-11-19' });
    expect(stored.askedOn).toBe('2026-11-19');

    await db.doc('readerSignals/alice_opened').set({ userId: 'alice', cardId: 'opened', lastAt: Timestamp.fromMillis(Date.parse('2026-10-01T00:00:00Z')), reachedEndAt: null, rereads: 0, activeSeconds: 40, maxProgress: 0.5 });
    const p = await buildUserProfile('alice', { db, now: Date.parse('2026-11-20T09:00:00Z') });
    expect(p.held.has('ignored')).toBe(true);
    expect(p.taste.negative.map((t) => t.cardId)).toEqual(['ignored']);
    // Opened (a month and more ago): no longer ignored, and back in the running.
    expect(p.held.has('opened')).toBe(false);
  });
});

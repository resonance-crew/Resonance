import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { publishCard } from '@/lib/api/v1/publish';
import { makeTapPassages } from '@/lib/api/v1/tapPassagesMake';
import { presentTapPassages } from '@/lib/api/v1/tapPassages';
import { restoreCard } from '@/lib/api/v1/trash';
import { offlinePassages, passagesHash, PASSAGES_TRIES_MAX, PASSAGES_VERSION } from '@/lib/cards/tapPassages';
import type { IVectorStore } from '@/lib/recommend/vectorStore';
import { indexOwed, INDEX_OWED_RESERVE_MS, PASSAGES_RESERVE_MS } from '@/lib/recommend/indexOwed';
import { INDEX_DEADLINE_MS, PASSAGES_TIMEOUT_MS } from '@/lib/ai/tasks';

// Making a card's tap passages (round 27 §P2) against the Firestore emulator:
// the offline pick a publish stores under the emulators, an applied edit that
// changes the words (and one that only changes their formatting), a story too
// short, a failure owed to the daily cron and settled by its pass, three
// failures left alone, and a newer save winning ('moved').

const PROJECT = 'demo-resonance-tap-passages';
let app: App;
let db: Firestore;
const mocks = vi.hoisted(() => ({ db: null as Firestore | null, offline: true }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({
  getVectorStore: (): Partial<IVectorStore> => ({ setVisibility: async () => {}, deleteByCard: async () => {}, upsert: async () => {} }),
}));
vi.mock('@/lib/text/translation', async (original) => ({
  ...(await original<typeof import('@/lib/text/translation')>()),
  modelsOffline: () => mocks.offline,
}));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'tap-passages-make-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

const P1 = '那年我搬到台北，一個人住在頂樓加蓋的小房間，夏天熱得睡不著，我常常坐在樓梯間吹風。';
const P2 = '最難的是第一個冬天，工作做不好，也不敢打電話回家，怕媽媽聽出我的聲音在發抖。每天下班都繞遠路走回去。';
const P3 = '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。';
const FILL = '日子一天一天過去，我把房間的牆刷成淡黃色，在窗邊種了幾盆香草，週末去市場買菜，跟攤販學說台語。';
const STORY = [P1, P2, FILL, FILL.replace('淡黃色', '淡藍色'), P3].join('\n\n');
const TITLE = '一個人的城市';
const slugBase = async () => 'a-city-alone';

const data = async (id: string) => (await db.doc(`cards/${id}`).get()).data()!;
const draft = (id: string, story = STORY) =>
  db.doc(`cards/${id}`).set({
    authorId: 'alice', thoughtCore: TITLE, story, tags: [], visibility: 'public', anonymous: false, publishedAt: null,
    readCount: 0, resonanceCount: 0, inviteCount: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
const published = (id: string, story = STORY) => draft(id, story).then(() => db.doc(`cards/${id}`).update({ publishedAt: Timestamp.now() }));
const failing = () => Promise.reject(Object.assign(new Error('OpenAI 503'), { status: 503 }));

beforeEach(async () => {
  mocks.offline = true;
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice', initials: 'AL', accentColor: 'x' });
});

describe('makeTapPassages', () => {
  it('stores the offline pick when a card is published under the emulators, and leaves updatedAt alone', async () => {
    await draft('c1');
    await publishCard(db, 'alice', 'c1', slugBase);
    const before = (await data('c1')).updatedAt;
    expect(await makeTapPassages(db, 'c1')).toBe('made');
    const stored = (await data('c1')).tapPassages;
    expect(stored).toMatchObject({ of: passagesHash(STORY), items: offlinePassages(STORY, { title: TITLE }), model: 'offline', v: PASSAGES_VERSION });
    expect(stored.items.length).toBeGreaterThanOrEqual(2);
    expect((await data('c1')).updatedAt).toEqual(before);
    // Made already: nothing asked again.
    expect(await makeTapPassages(db, 'c1', { pick: failing })).toBe('unchanged');
  });

  it('makes again a value stored before whole sentences (no `v`: round 27\'s), for the same text', async () => {
    await published('c1');
    // Round 27's value: clauses cut mid-sentence, no version.
    await db.doc('cards/c1').update({ tapPassages: { of: passagesHash(STORY), items: [{ id: 'old1', text: P1.slice(0, 15) }], model: 'm' } });
    const pick = vi.fn(async () => ({ passages: [P1, P3], model: 'm2' }));
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('made');
    expect(pick).toHaveBeenCalledTimes(1);
    expect((await data('c1')).tapPassages).toMatchObject({ of: passagesHash(STORY), items: [{ text: P1 }, { text: P3 }], model: 'm2', v: PASSAGES_VERSION });
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('unchanged');
  });

  it('keeps only whole sentences of the story: a clause cut mid-sentence is no passage', async () => {
    await published('c1');
    const pick = vi.fn(async () => ({ passages: [P1.slice(0, 15), P3.slice(0, 15)], model: 'm' }));
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('none');
    expect((await data('c1')).tapPassages).toMatchObject({ of: passagesHash(STORY), items: [] });
  });

  it('makes them again after an applied edit that changes the words, not after one that only changes their formatting', async () => {
    await published('c1');
    expect(await makeTapPassages(db, 'c1')).toBe('made');
    const pick = vi.fn(async () => ({ passages: [P1, P2], model: 'm' }));
    await db.doc('cards/c1/edits/current').set({ thoughtCore: TITLE, story: STORY.replace('煮一鍋湯', '**煮一鍋湯**'), tags: [], visibility: 'public' });
    await applyCardEdit(db, 'alice', 'c1');
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('unchanged');
    expect(pick).not.toHaveBeenCalled();
    const changed = STORY.replace('煮一鍋湯', '煮一碗湯');
    await db.doc('cards/c1/edits/current').set({ thoughtCore: TITLE, story: changed, tags: [], visibility: 'public' });
    await applyCardEdit(db, 'alice', 'c1');
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('made');
    expect(pick).toHaveBeenCalledTimes(1);
    expect((await data('c1')).tapPassages).toMatchObject({ of: passagesHash(changed), items: [{ text: P1 }, { text: P2 }], model: 'm' });
  });

  it('stores none for a story too short, and takes them off a card that is no longer published', async () => {
    await published('short', P1);
    expect(await makeTapPassages(db, 'short')).toBe('none');
    expect((await data('short')).tapPassages).toBeUndefined();
    await published('c1');
    await makeTapPassages(db, 'c1');
    await db.doc('cards/c1').update({ publishedAt: null });
    expect(await makeTapPassages(db, 'c1')).toBe('removed');
    expect((await data('c1')).tapPassages).toBeUndefined();
  });

  it('keeps them on a card in the trash, and makes them for an edit applied there: a restored card offers them', async () => {
    await published('c1');
    await makeTapPassages(db, 'c1');
    await db.doc('cards/c1').update({ trashedAt: Timestamp.now() });
    // The cron or an applied edit passes over it while it is in the trash.
    expect(await makeTapPassages(db, 'c1')).toBe('unchanged');
    const changed = STORY.replace('煮一鍋湯', '煮一碗湯');
    await db.doc('cards/c1').update({ story: changed });
    expect(await makeTapPassages(db, 'c1')).toBe('made');
    await restoreCard(db, 'alice', 'c1', { vectors: { setVisibility: async () => {} } });
    const card = await data('c1');
    expect(card.trashedAt ?? null).toBeNull();
    expect(presentTapPassages(card).length).toBeGreaterThanOrEqual(2);
    expect(card.tapPassages.of).toBe(passagesHash(changed));
  });

  it('settles a pick with fewer than two of the story\'s own words as none, never asked again for that text', async () => {
    await published('c1');
    const pick = vi.fn(async () => ({ passages: ['words the model wrote itself', P1], model: 'm' }));
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('none');
    expect((await data('c1')).tapPassages).toMatchObject({ of: passagesHash(STORY), items: [] });
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('unchanged');
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('marks a failure owed, and the daily cron\'s pass settles it', async () => {
    await published('c1');
    expect(await makeTapPassages(db, 'c1', { pick: failing })).toBe('failed');
    let card = await data('c1');
    expect(card.indexPendingAt).toBeInstanceOf(Timestamp);
    expect(card.tapPassages).toEqual({ failed: { of: passagesHash(STORY), tries: 1 } });
    // Out of budget: owed too, no try counted.
    expect(await makeTapPassages(db, 'c1', { mayCall: async () => false, pick: failing })).toBe('over-budget');
    expect((await data('c1')).tapPassages.failed.tries).toBe(1);
    // The cron (offline here: no model answers under the emulators) reads it again and makes them.
    const run = await indexOwed(db);
    expect(run.passages).toEqual({ made: 1 });
    card = await data('c1');
    expect(card.tapPassages).toMatchObject({ of: passagesHash(STORY), model: 'offline' });
    expect(card.tapPassages.failed).toBeUndefined();
  });

  it("never starts a pick that would not end before the cron's function does: the card is owed again, not lost", async () => {
    // The cron's whole run (maxDuration 300 s): a reading started at the last allowed moment that runs to its own
    // deadline, then its passages' timeout, still ends inside it.
    const end = 300_000;
    expect(end - INDEX_OWED_RESERVE_MS - 1 + INDEX_DEADLINE_MS + PASSAGES_TIMEOUT_MS).toBeLessThan(end);
    await published('c1');
    await db.doc('cards/c1').update({ indexPendingAt: Timestamp.now() });
    // The reading starts at the last allowed moment and takes its whole 100 s, plus a second.
    const last = end - INDEX_OWED_RESERVE_MS - 1;
    const clock = { reads: 0 };
    const now = () => (clock.reads++ === 0 ? last : last + INDEX_DEADLINE_MS + 1_000);
    const pick = vi.fn(async () => ({ passages: [P1, P3], model: 'm' }));
    const run = await indexOwed(db, { end, now, pick });
    expect(run).toMatchObject({ examined: 1, passages: { 'over-budget': 1 } });
    expect(pick).not.toHaveBeenCalled();
    expect((await data('c1')).indexPendingAt).toBeInstanceOf(Timestamp);
    // Started past the reserve: no reading at all.
    const late = await indexOwed(db, { end, now: () => end - INDEX_OWED_RESERVE_MS, pick });
    expect(late).toMatchObject({ examined: 0, left: 1 });
    // With time left, the pick runs and the card is settled.
    const early = await indexOwed(db, { end, now: () => 0, pick });
    expect(early.passages).toEqual({ made: 1 });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(PASSAGES_RESERVE_MS).toBeGreaterThan(PASSAGES_TIMEOUT_MS);
  });

  it(`leaves a text alone after ${PASSAGES_TRIES_MAX} failures, until the story changes`, async () => {
    await published('c1');
    for (let i = 0; i < PASSAGES_TRIES_MAX; i++) expect(await makeTapPassages(db, 'c1', { pick: failing })).toBe('failed');
    const pick = vi.fn(async () => ({ passages: [P1, P3], model: 'm' }));
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('given-up');
    expect(pick).not.toHaveBeenCalled();
    await db.doc('cards/c1').update({ story: `${STORY}\n\n${P3.replace('湯', '粥')}` });
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('made');
  });

  it("answers 'moved' and writes nothing when the story changed while the model ran", async () => {
    await published('c1');
    const pick = async () => {
      await db.doc('cards/c1').update({ story: STORY.replace('煮一鍋湯', '煮一碗湯') });
      return { passages: [P1, P3], model: 'm' };
    };
    expect(await makeTapPassages(db, 'c1', { pick })).toBe('moved');
    expect((await data('c1')).tapPassages).toBeUndefined();
  });

  it('waits for the reading before marking a failure owed (publishing runs both side by side)', async () => {
    await published('c1');
    let settle!: () => void;
    const indexed = new Promise<void>((r) => (settle = r));
    const run = makeTapPassages(db, 'c1', { pick: failing, markAfter: indexed });
    await new Promise((r) => setTimeout(r, 200));
    expect((await data('c1')).indexPendingAt).toBeUndefined();
    settle();
    expect(await run).toBe('failed');
    expect((await data('c1')).indexPendingAt).toBeInstanceOf(Timestamp);
  });
});

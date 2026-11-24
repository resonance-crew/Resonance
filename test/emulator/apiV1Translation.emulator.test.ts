import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { deleteCard } from '@/lib/api/v1/cards';
import { getFeed } from '@/lib/api/v1/service';
import { summarize } from '@/lib/api/v1/summary';
import { summaryHash } from '@/lib/api/v1/summaryTranslations';
import { translateCard } from '@/lib/api/v1/translation';
import { translationHash } from '@/lib/api/v1/translationHash';
import { backfillSummaryTranslations } from '../../scripts/backfills/summaryTranslations';
import { backfillStoryTranslations } from '../../scripts/backfills/storyTranslations';
import { TRANSLATE_MAX_CHARS } from '@/lib/text/translation';

// What the rules give the client the server re-checks (round 25 §F5, §F7):
// a story is translated only for a reader who may read it, only while it is
// published and public; its kept translation and an anonymous card's answer
// name no one; a FeedCard carries the translated title and excerpt of a
// public card only, and only while they still describe it.

const PROJECT = 'demo-resonance-translation';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-translation-test');
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});

const TITLE = '一場雨後的散步';
const STORY = '雨停的時候，巷口的積水映出整排路燈。';
const published = Timestamp.fromMillis(Date.now() - 60_000);
const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: TITLE,
  story: STORY,
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: published,
  ...extra,
});
const made = { title: 'A walk after the rain', story: 'When the rain stopped…' };
const translate = async () => made;

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol' }),
    db.doc('cards/pub').set(card({ slug: 'a-walk' })),
    db.doc('cards/anon').set(card({ anonymous: true })),
    db.doc('cards/conn').set(card({ visibility: 'connections' })),
    db.doc('cards/priv').set(card({ visibility: 'private' })),
    db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'] }),
  ]);
});

describe('translateCard', () => {
  it('translates a public card — named or anonymous — keeps it under the card, and answers nothing about its author', async () => {
    expect(await translateCard(db, 'carol', 'a-walk', 'en', { translate })).toEqual({ to: 'en', ...made });
    const kept = (await db.doc('cards/pub/translations/en').get()).data()!;
    expect(kept).toMatchObject({ ...made, hash: translationHash(TITLE, STORY) });
    expect(Object.keys(kept).sort()).toEqual(['createdAt', 'hash', 'model', 'story', 'title']);
    const anon = await translateCard(db, 'carol', 'anon', 'en', { translate });
    expect(JSON.stringify(anon)).not.toContain('alice');
    expect(JSON.stringify((await db.doc('cards/anon/translations/en').get()).data())).not.toContain('alice');
  });

  it("is the missing card's 404 for a connection's card, a 私人卡 and a card in the trash", async () => {
    for (const id of ['conn', 'priv']) {
      await expect(translateCard(db, 'carol', id, 'en', { translate })).rejects.toMatchObject({ code: 'not_found' });
    }
    await db.doc('cards/pub').update({ visibility: 'private', trashedAt: Timestamp.now() });
    await expect(translateCard(db, 'carol', 'pub', 'en', { translate })).rejects.toMatchObject({ code: 'not_found' });
    expect((await db.collectionGroup('translations').get()).size).toBe(0);
  });

  it('goes with the card when it is deleted', async () => {
    await translateCard(db, 'carol', 'pub', 'en', { translate });
    await deleteCard(db, 'alice', 'pub', { vectors: { deleteByCard: async () => {} } });
    expect((await db.doc('cards/pub/translations/en').get()).exists).toBe(false);
  });
});

describe("a FeedCard's translated title and excerpt", () => {
  it('come with a public card while current, and never with one turned private', async () => {
    const of = summaryHash(TITLE, summarize(STORY).excerpt);
    const en = { title: 'A walk after the rain', excerpt: 'When the rain stopped…' };
    await db.doc('cards/pub').update({ summaryTranslations: { of, en } });
    const feed = await getFeed(db, 'carol', 10);
    expect(feed.cards.find((c) => c.id === 'pub')?.summaryTranslations).toEqual({ en });
    await db.doc('cards/pub').update({ thoughtCore: '改過的標題' });
    expect((await getFeed(db, 'carol', 10)).cards.find((c) => c.id === 'pub')?.summaryTranslations).toBeNull();
  });
});

describe('backfill.ts summary-translations', () => {
  it('counts the public cards without current ones, makes them with --apply, and finds none the next time', async () => {
    const quiet = () => {};
    const translateSummary = async (input: { title: string; excerpt: string }) => ({ en: { title: `EN ${input.title}`, excerpt: `EN ${input.excerpt}` } });
    const dry = await backfillSummaryTranslations(db, { apply: false, log: quiet });
    // The named and the anonymous public card; never a connection's card or a 私人卡.
    expect(dry.candidates).toBe(2);
    expect((await db.doc('cards/pub').get()).get('summaryTranslations')).toBeUndefined();
    const run = await backfillSummaryTranslations(db, { apply: true, log: quiet, pauseMs: 0, translate: translateSummary });
    expect(run.made).toBe(2);
    expect((await db.doc('cards/pub').get()).get('summaryTranslations')).toEqual({ of: summaryHash(TITLE, summarize(STORY).excerpt), en: { title: `EN ${TITLE}`, excerpt: `EN ${summarize(STORY).excerpt}` } });
    expect((await db.doc('cards/priv').get()).get('summaryTranslations')).toBeUndefined();
    expect((await backfillSummaryTranslations(db, { apply: false, log: quiet })).candidates).toBe(0);
  });

  it('judges a card by the excerpt a list shows of it: a current stored summary an older build made is no candidate once done', async () => {
    const quiet = () => {};
    const translateSummary = async (input: { title: string; excerpt: string }) => ({ en: { title: `EN ${input.title}`, excerpt: `EN ${input.excerpt}` } });
    // a stored summary, current (stamped with the card's last write), whose words are not what summarize() makes of
    // the story today — as an older build's excerpt is
    const old = '雨停的時候…（舊版摘要）';
    expect(old).not.toBe(summarize(STORY).excerpt);
    const stamp = Timestamp.fromMillis(Date.now() - 30_000);
    await db.doc('cards/pub').set(card({ slug: 'a-walk', excerpt: old, readMinutes: 1, excerptAt: stamp, updatedAt: stamp }));
    expect((await backfillSummaryTranslations(db, { apply: false, log: quiet })).candidates).toBe(2);
    const run = await backfillSummaryTranslations(db, { apply: true, log: quiet, pauseMs: 0, translate: translateSummary });
    expect(run.made).toBe(2);
    // made from the excerpt a list shows of it, the stored one
    expect((await db.doc('cards/pub').get()).get('summaryTranslations')).toEqual({ of: summaryHash(TITLE, old), en: { title: `EN ${TITLE}`, excerpt: `EN ${old}` } });
    // and done: the next count finds none (it counted this card for ever while it compared with the story's excerpt)
    expect((await backfillSummaryTranslations(db, { apply: false, log: quiet })).candidates).toBe(0);
  });
});

describe('backfill.ts story-translations', () => {
  const quiet = () => {};
  const failing = async () => {
    throw new Error('the model was asked');
  };

  it('keeps every public story translated as the route keeps it, so the first reader is answered at once', async () => {
    await Promise.all([
      db.doc('cards/trashed').set(card({ trashedAt: Timestamp.fromMillis(Date.now() - 1_000) })),
      db.doc('cards/long').set(card({ story: '字'.repeat(TRANSLATE_MAX_CHARS + 1) })),
      db.doc('cards/draft').set(card({ publishedAt: null })),
    ]);
    const dry = await backfillStoryTranslations(db, { apply: false, log: quiet });
    // The named and the anonymous public card; never a connection's card, a 私人卡, a draft or one in the trash.
    expect(dry).toMatchObject({ publicCards: 3, candidates: 2, tooLong: 1, made: 0 });
    expect((await db.doc('cards/pub/translations/en').get()).exists).toBe(false);

    const asked: string[] = [];
    const run = await backfillStoryTranslations(db, {
      apply: true,
      log: quiet,
      pauseMs: 0,
      translate: async (input, to) => {
        asked.push(`${input.title}→${to}`);
        return made;
      },
    });
    expect(run).toMatchObject({ candidates: 2, made: 2, failed: 0 });
    expect(asked).toEqual([`${TITLE}→en`, `${TITLE}→en`]);
    const kept = (await db.doc('cards/pub/translations/en').get()).data()!;
    expect(kept).toMatchObject({ ...made, hash: translationHash(TITLE, STORY) });
    expect(typeof kept.model).toBe('string');
    // The route answers what it kept, without the model or the reader's budget.
    expect(await translateCard(db, 'carol', 'a-walk', 'en', { translate: failing })).toEqual({ to: 'en', ...made });
    expect(await translateCard(db, 'carol', 'anon', 'en', { translate: failing })).toEqual({ to: 'en', ...made });
    expect((await db.doc('cards/priv/translations/en').get()).exists).toBe(false);
    expect((await db.doc('cards/trashed/translations/en').get()).exists).toBe(false);
    // Done: none the next time, until a story changes.
    expect((await backfillStoryTranslations(db, { apply: false, log: quiet })).candidates).toBe(0);
    await db.doc('cards/pub').update({ story: `${STORY}後來又下起雨。` });
    expect((await backfillStoryTranslations(db, { apply: false, log: quiet })).candidates).toBe(1);
  });

  it('places the passages in what it makes, and again in a kept translation placed by the older recipe (round 35)', async () => {
    const { passagesHash, PASSAGES_VERSION } = await import('@/lib/cards/tapPassages');
    const { passagesSig } = await import('@/lib/cards/translatedPassages');
    const story = '那不是一個糟糕的成績，卻是一個固執的結果。\n\n我不需要每一步都算得比對手深，但可以每一步都多問自己一個問題。';
    const items = [
      { id: 'p1', text: '那不是一個糟糕的成績，卻是一個固執的結果。' },
      { id: 'p2', text: '我不需要每一步都算得比對手深，但可以每一步都多問自己一個問題。' },
    ];
    const translated = 'That was not a bad score, but it was a **stubborn result**.\n\n**I do not need to calculate more deeply than my opponent.**';
    // Only these two cards, each offering two passages: one with no translation yet, one whose kept placing is the
    // old recipe's empty answer (the production cards' state).
    await Promise.all(['pub', 'anon', 'conn', 'priv', 'trashed'].map((id) => db.doc(`cards/${id}`).delete()));
    const passages = { of: passagesHash(story), items, model: 'test', v: PASSAGES_VERSION };
    await Promise.all([
      db.doc('cards/fresh').set(card({ story, tapPassages: passages })),
      db.doc('cards/stale').set(card({ story, tapPassages: passages })),
    ]);
    await db.doc('cards/stale/translations/en').set({
      title: 'Stale', story: translated, hash: translationHash(TITLE, story), model: 'test', createdAt: published,
      passages: { of: 'p1,p2', items: [], at: published },
    });
    const dry = await backfillStoryTranslations(db, { apply: false, log: quiet });
    expect(dry).toMatchObject({ candidates: 1, toPlace: 2 });
    // The model copies with the Markdown marks, as in production; the pieces kept are the plain words.
    const place = async () => [
      { id: 'p1', text: 'That was not a bad score, but it was a **stubborn result**.' },
      { id: 'p2', text: '**I do not need to calculate more deeply than my opponent.**' },
    ];
    const run = await backfillStoryTranslations(db, { apply: true, log: quiet, pauseMs: 0, translate: async () => ({ title: 'T', story: translated }), place });
    expect(run).toMatchObject({ made: 1, placed: 2, placedFew: 0, placeFailed: 0 });
    const want = [
      { id: 'p1', text: 'That was not a bad score, but it was a stubborn result.' },
      { id: 'p2', text: 'I do not need to calculate more deeply than my opponent.' },
    ];
    for (const id of ['fresh', 'stale']) {
      const kept = (await db.doc(`cards/${id}/translations/en`).get()).get('passages');
      expect(kept).toMatchObject({ of: passagesSig(items), items: want });
      // The route answers them as kept: no model asked.
      expect((await translateCard(db, 'carol', id, 'en', { translate: failing, place: async () => { throw new Error('not asked'); } })).passages).toEqual(want);
    }
    // Done: nothing to place the next time.
    expect((await backfillStoryTranslations(db, { apply: false, log: quiet })).toPlace).toBe(0);
  });

  it('keeps nothing for a story the model failed, and counts it', async () => {
    const run = await backfillStoryTranslations(db, { apply: true, log: quiet, pauseMs: 0, translate: failing });
    expect(run).toMatchObject({ candidates: 2, made: 0, failed: 2 });
    expect((await db.collection('cards/pub/translations').get()).empty).toBe(true);
  });
});

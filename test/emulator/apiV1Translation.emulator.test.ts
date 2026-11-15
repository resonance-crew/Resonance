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
});

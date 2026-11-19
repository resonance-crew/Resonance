import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { deleteCard } from '@/lib/api/v1/cards';
import { restoreCard, trashCard } from '@/lib/api/v1/trash';
import { indexCard } from '@/lib/recommend/indexCard';
import { indexOwed, markIndexOwed } from '@/lib/recommend/indexOwed';
import { offlineVector } from '@/lib/recommend/offline';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';
import type { CardReading } from '@/lib/db/types';
import type { CardReadingResult, ReadCardOptions } from '@/lib/ai/tasks';
import { ChatIncomplete } from '@/lib/ai/openai';

// The recommender's write-time pipeline (indexCard) against the Firestore
// emulator, with the LLM and the embeddings stood in for. Publish starts it
// after its response and it takes seconds, so a card can go to the trash —
// and come back — while it runs. Restoring a card only gives its vectors
// their visibility back (it runs where OpenAI can't be reached), so a card
// the trash met here must still have its vectors, private while there.
// Round 26 §A1: the reading is kept server-only (`cardSignatures`), the card
// keeps its through line, placeholder flag and hash, and a card is several
// parts (`cardVectors/{id}__{channel}__{i}`).

const PROJECT = 'demo-resonance-index-card';
let app: App;
let db: Firestore;
const mocks = vi.hoisted(() => ({
  db: null as Firestore | null,
  store: null as IVectorStore | null,
  /** Runs inside the embedding call: what happens to the card while the LLM works. */
  whileEmbedding: null as (() => Promise<unknown>) | null,
  /** Runs inside the vector write, before it lands: what happens between the card's last read and the write. */
  beforeUpsert: null as (() => Promise<unknown>) | null,
  /** Runs inside the vectors' removal, before it lands: what happens while an unlisted reading leaves the pool. */
  whileDeletingVectors: null as (() => Promise<unknown>) | null,
  /** Runs inside the reading's LLM call. */
  whileSigning: null as (() => Promise<unknown>) | null,
  /** How many readings were asked of the LLM, and with what. */
  signed: 0,
  asked: [] as ReadCardOptions[],
  /** What the stand-in model answers beside its fixed reading. */
  reading: {} as Partial<CardReading>,
  /** The next answers of the stand-in model, before its fixed one (a function: throw, or a reading). */
  next: [] as (() => Partial<CardReadingResult>)[],
  /** The emulators' stand-in: no model at all (lib/recommend/offline). */
  offline: false,
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/text/translation', async (original) => ({
  ...(await original<typeof import('@/lib/text/translation')>()),
  modelsOffline: () => mocks.offline,
}));
const strongInsight = {
  span: 'tonight',
  situation: 'clearing out a drawer',
  struggle: 'what to keep',
  thinking: 'everything mattered',
  gain: 'one letter is enough',
  shift: 'keeping all → keeping one',
  insight: 'Letting go is a kind of keeping.',
  reader: 'someone moving house',
  evidence: 'I cleared out the drawer',
  strength: 0.9,
};
vi.mock('@/lib/ai/tasks', async (original) => ({
  ...(await original<typeof import('@/lib/ai/tasks')>()),
  readCard: async (_input: unknown, opts: ReadCardOptions = {}): Promise<CardReadingResult> => {
    mocks.signed++;
    mocks.asked.push(opts);
    await mocks.whileSigning?.();
    opts.onUsage?.({ input: 1000, output: 500, reasoning: 300 });
    const next = mocks.next.shift()?.();
    return {
      model: 'gpt-6.2-sol',
      error: null,
      ...next,
      reading: {
        insights: [strongInsight],
        throughLine: 'Keeping one letter',
        moodOnly: false,
        insightScore: 0.9,
        lifeDomain: '日常',
        emotionalRegister: 'quiet',
        placeholder: false,
        ...mocks.reading,
        ...next?.reading,
      },
    };
  },
}));
vi.mock('@/lib/ai/openai', async (original) => ({
  ...(await original<typeof import('@/lib/ai/openai')>()),
  embed: async (texts: string[], opts: { onUsage?: (u: { input: number; output: number; reasoning: number }) => void } = {}) => {
    await mocks.whileEmbedding?.();
    opts.onUsage?.({ input: 40, output: 0, reasoning: 0 });
    return texts.map((_, i) => [0.1, 0.2, 0.3 + i]);
  },
}));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'index-card-test');
  db = getFirestore(app);
  mocks.db = db;
  const real = new FirestoreVectorStore(db);
  mocks.store = Object.assign(Object.create(real) as IVectorStore, {
    upsert: async (records: Parameters<IVectorStore['upsert']>[0]) => {
      await mocks.beforeUpsert?.();
      return real.upsert(records);
    },
    deleteByCard: async (cardId: string) => {
      await mocks.whileDeletingVectors?.();
      return real.deleteByCard(cardId);
    },
  });
});

afterAll(async () => {
  await deleteApp(app);
});

const published = Timestamp.fromDate(new Date('2026-10-20T08:00:00Z'));

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  mocks.whileEmbedding = null;
  mocks.beforeUpsert = null;
  mocks.whileDeletingVectors = null;
  mocks.whileSigning = null;
  mocks.signed = 0;
  mocks.asked = [];
  mocks.reading = {};
  mocks.next = [];
  mocks.offline = false;
  await Promise.all([
    db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice', initials: 'a', accentColor: 'x' }),
    db.doc('cards/live').set({
      authorId: 'alice',
      thoughtCore: 'A drawer',
      story: 'I cleared out the drawer tonight.',
      tags: [],
      visibility: 'public',
      anonymous: false,
      slug: 'a-drawer',
      publishedAt: published,
      resonanceCount: 0,
    } satisfies DocumentData),
  ]);
});

/** The card's vectors' visibility, by channel (empty: it has none). */
async function vectorsOf(cardId: string): Promise<Record<string, unknown>> {
  const snap = await db.collection('cardVectors').where('cardId', '==', cardId).get();
  return Object.fromEntries(snap.docs.map((d) => [d.get('channel'), d.get('visibility')]));
}

const trash = () => trashCard(db, 'alice', 'live', { vectors: mocks.store! });
const restore = () => restoreCard(db, 'alice', 'live', { vectors: mocks.store! });
/** Its author's 永久刪除 (DELETE /cards/{id}): the card, its reading and its vectors, for good. */
const deleteForGood = () => deleteCard(db, 'alice', 'live', { vectors: mocks.store! });
/** A hook that runs once: the delete lands at that point of the run, and the delete's own calls pass through. */
const once = (hook: 'whileEmbedding' | 'whileSigning' | 'whileDeletingVectors', run: () => Promise<unknown>) => {
  mocks[hook] = async () => {
    mocks[hook] = null;
    await run();
  };
};

describe('indexing a card the trash reaches meanwhile', () => {
  it('indexes a card trashed while the LLM ran, its vectors private, and the restore brings them back public', async () => {
    mocks.whileEmbedding = trash;
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
    // Never lost: the reading is kept, the card has its through line.
    expect((await db.doc('cards/live').get()).get('signature')).toMatchObject({ coreInsight: 'Keeping one letter' });

    await restore();
    expect(await vectorsOf('live')).toEqual({ insight: 'public', situation: 'public' });
  });

  it('indexes a card already in the trash when it starts (published, then deleted at once), private until restored', async () => {
    await trash();
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
    expect((await db.doc('cards/live').get()).get('signature')).toBeDefined();

    await restore();
    expect(await vectorsOf('live')).toEqual({ insight: 'public', situation: 'public' });
  });

  it('keeps an indexed card\'s vectors when it goes to the trash during a re-index (an applied edit), so its restore finds them', async () => {
    await indexCard('live');
    await db.doc('cards/live').update({ story: 'I cleared out the drawer tonight, and kept the key.' });
    mocks.whileEmbedding = trash;
    await indexCard('live');
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
    await restore();
    expect(await vectorsOf('live')).toEqual({ insight: 'public', situation: 'public' });
  });

  // The restore's own setVisibility ran before the vectors existed: the
  // write follows the card as it is once it has landed.
  it('follows a restore that lands between its last read of the card and its write', async () => {
    mocks.whileEmbedding = trash;
    mocks.beforeUpsert = async () => {
      mocks.beforeUpsert = null;
      await restore();
    };
    await indexCard('live');
    expect(await vectorsOf('live')).toEqual({ insight: 'public', situation: 'public' });
  });

  it('follows a trash that lands between its last read of the card and its write', async () => {
    mocks.beforeUpsert = async () => {
      mocks.beforeUpsert = null;
      await trash();
    };
    await indexCard('live');
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
  });

  it('leaves no vectors for a card deleted between its last read and its write', async () => {
    mocks.beforeUpsert = async () => {
      mocks.beforeUpsert = null;
      await db.doc('cards/live').delete();
      await mocks.store!.deleteByCard('live');
    };
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'not-found' });
    expect(await vectorsOf('live')).toEqual({});
  });
});

// Round 26 §A1.6: a card's reading is deleted with it (deleteCard's transaction), and indexCard writes the reading
// only in a transaction that finds the card still there — so a card deleted for good while the models ran (up to
// INDEX_DEADLINE_MS after its publish or applied edit) is left with no reading, and no vectors.
describe('indexing a card deleted for good while it runs', () => {
  const reading = () => db.doc('cardSignatures/live').get();

  it('leaves no reading and no vectors for a card deleted while its vectors were embedded', async () => {
    once('whileEmbedding', deleteForGood);
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'not-found' });
    expect((await reading()).exists).toBe(false);
    expect(await vectorsOf('live')).toEqual({});
    expect((await db.doc('cards/live').get()).exists).toBe(false);
  });

  it('leaves none for an unlisted reading (feeling only) whose card was deleted as it left the pool', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    mocks.reading = { moodOnly: true };
    once('whileDeletingVectors', deleteForGood);
    expect(await indexCard('live', { force: true })).toEqual({ indexed: false, reason: 'not-found' });
    expect((await reading()).exists).toBe(false);
    expect(await vectorsOf('live')).toEqual({});
    expect((await db.doc('cards/live').get()).exists).toBe(false);
  });

  it('records no failed reading for a card deleted while it was read, the model cut off at its cap', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    await db.doc('cards/live').update({ story: 'I cleared out the drawer tonight, and kept the key.' });
    once('whileSigning', deleteForGood);
    mocks.next = [() => { throw new ChatIncomplete('length', ''); }];
    expect((await indexCard('live')).indexed).toBe(false);
    expect((await reading()).exists).toBe(false);
    expect(await vectorsOf('live')).toEqual({});
    expect((await db.doc('cards/live').get()).exists).toBe(false);
  });
});

// An applied edit re-indexes the card after the response. One that leaves
// what the signature reads as it was (tags, a cover, the byline, the story
// past its opening) asks no LLM: the signature keeps the hash of the text it
// was made from. The vectors' visibility follows the card either way, and
// before any LLM call.
describe('indexing a card whose text has not changed', () => {
  it('asks the LLM nothing again, and still gives the vectors the card\'s visibility', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(mocks.signed).toBe(1);
    expect((await db.doc('cards/live').get()).get('signature.contentHash')).toEqual(expect.any(String));
    // A save of everything but the text (the vectors left behind, as a failed sync would).
    await db.doc('cards/live').update({ tags: ['日常'], visibility: 'connections' });
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'unchanged' });
    expect(mocks.signed).toBe(1);
    expect(await vectorsOf('live')).toEqual({ insight: 'connections', situation: 'connections' });
  });

  it('makes the signature again once the text changes, and when forced', async () => {
    await indexCard('live');
    await db.doc('cards/live').update({ thoughtCore: 'A drawer, emptied' });
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(mocks.signed).toBe(2);
    expect(await indexCard('live', { force: true })).toEqual({ indexed: true, channels: 2 });
    expect(mocks.signed).toBe(3);
  });

  it("asks the caller's budget only when the LLM would run, and keeps the last index when it says no", async () => {
    const mayCall = vi.fn(async () => true);
    expect(await indexCard('live', { mayCall })).toEqual({ indexed: true, channels: 2 });
    expect(mayCall).toHaveBeenCalledTimes(1);
    // Unchanged text: no LLM, so nothing spent.
    await db.doc('cards/live').update({ tags: ['日常'] });
    expect(await indexCard('live', { mayCall })).toEqual({ indexed: false, reason: 'unchanged' });
    expect(mayCall).toHaveBeenCalledTimes(1);
    // Changed text over budget: the signature stays, the vectors still take the card's visibility.
    await db.doc('cards/live').update({ thoughtCore: 'A drawer, emptied', visibility: 'private' });
    mayCall.mockResolvedValueOnce(false);
    expect(await indexCard('live', { mayCall })).toEqual({ indexed: false, reason: 'over-budget' });
    expect(mocks.signed).toBe(1);
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
  });

  it('gives the vectors the card\'s visibility before the LLM is asked', async () => {
    await indexCard('live');
    await db.doc('cards/live').update({ story: 'Another story, of the drawer I cleared tonight.', visibility: 'private' });
    let during: Record<string, unknown> | null = null;
    mocks.whileSigning = async () => void (during = await vectorsOf('live'));
    await indexCard('live');
    expect(during).toEqual({ insight: 'private', situation: 'private' });
  });

  it('follows a trash that lands while an unchanged card is synced', async () => {
    await indexCard('live');
    const real = mocks.store!.setVisibility.bind(mocks.store);
    const once = vi.spyOn(mocks.store!, 'setVisibility').mockImplementationOnce(async (id, visibility) => {
      await real(id, visibility);
      await trash();
    });
    try {
      expect(await indexCard('live')).toEqual({ indexed: false, reason: 'unchanged' });
    } finally {
      once.mockRestore();
    }
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
  });

  it('keeps no hash for a text that changed while its signature was being made: the next save makes it again', async () => {
    mocks.whileEmbedding = async () => {
      mocks.whileEmbedding = null;
      await db.doc('cards/live').update({ story: 'Saved again while the index was being made tonight.' });
    };
    await indexCard('live');
    expect((await db.doc('cards/live').get()).get('signature.contentHash')).toBeUndefined();
    await indexCard('live');
    expect(mocks.signed).toBe(2);
    expect((await db.doc('cards/live').get()).get('signature.contentHash')).toEqual(expect.any(String));
  });
});

// A card is its parts (round 26 §A2.1): written in place, and the parts a new reading no longer has — or an older
// format's ids — go in the same batch.
describe('FirestoreVectorStore with parts', () => {
  const record = (cardId: string, authorId: string, channel: 'insight' | 'situation', part: number, vector: number[], visibility: 'public' | 'private' = 'public') => ({
    cardId, authorId, channel, part, vector, visibility, embedModel: 'm', insightScore: 0.9, coreInsight: 'c', situation: 's', lifeDomain: 'd', span: '',
  });
  const idsOf = async (cardId: string) => (await db.collection('cardVectors').where('cardId', '==', cardId).get()).docs.map((d) => d.id).sort();

  it('makes the new parts the card’s, deleting the rest — the older one-per-channel ids too', async () => {
    const store = new FirestoreVectorStore(db);
    await db.doc('cardVectors/a1__insight').set({ cardId: 'a1', authorId: 'alice', visibility: 'public', channel: 'insight' });
    await store.upsert([record('a1', 'alice', 'insight', 0, [1, 0, 0]), record('a1', 'alice', 'insight', 1, [0, 1, 0]), record('a1', 'alice', 'situation', 0, [0, 0, 1])]);
    expect(await idsOf('a1')).toEqual(['a1__insight__0', 'a1__insight__1', 'a1__situation__0']);
    await store.upsert([record('a1', 'alice', 'insight', 0, [1, 0, 0])]);
    expect(await idsOf('a1')).toEqual(['a1__insight__0']);
  });

  it('lists a visibility’s records with their vectors (the pool), and any cards’ whatever their visibility (a taste)', async () => {
    const store = new FirestoreVectorStore(db);
    await store.upsert([record('a1', 'alice', 'insight', 0, [1, 0, 0]), record('a2', 'alice', 'insight', 0, [0, 1, 0], 'private'), record('b1', 'bob', 'situation', 0, [0, 0, 1])]);
    const pool = await store.listByVisibility('public');
    expect(pool.map((r) => r.cardId).sort()).toEqual(['a1', 'b1']);
    expect(pool.find((r) => r.cardId === 'a1')!.vector).toEqual([1, 0, 0]);
    expect((await store.listByVisibility('public', 'situation')).map((r) => r.cardId)).toEqual(['b1']);
    expect((await store.listByCards(['a2', 'b1'])).map((r) => [r.cardId, r.visibility]).sort()).toEqual([['a2', 'private'], ['b1', 'public']]);
  });
});

// A blank card (lib/cards/blank) is no reader's candidate.
describe('indexing a blank card', () => {
  it('asks the LLM nothing and leaves no vectors — those an earlier version had go too', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    await db.doc('cards/live').update({ story: '  \n\n![](https://img.resonance.channel/a.webp)' });
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'blank' });
    expect(mocks.signed).toBe(1);
    expect(await vectorsOf('live')).toEqual({});
    await db.doc('cards/live').update({ thoughtCore: '', story: 'Words again.' });
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'blank' });
    expect(mocks.signed).toBe(1);
  });
});

// A thin card or a placeholder (lib/cards/blank) is no list's: no vectors, and the card says so.
describe('indexing a thin card or a placeholder', () => {
  it('asks the LLM nothing for a thin card, drops its vectors and stamps it — and takes the stamp back once it has words', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    // An older build's client write: the story changed, no stamp with it.
    await db.doc('cards/live').update({ thoughtCore: '測試', story: '測試' });
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'thin' });
    expect(mocks.signed).toBe(1);
    expect(await vectorsOf('live')).toEqual({});
    expect((await db.doc('cards/live').get()).get('thin')).toBe(true);

    await db.doc('cards/live').update({ thoughtCore: 'A drawer', story: 'I cleared out the drawer tonight, and kept one letter.' });
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(mocks.signed).toBe(2);
    const card = await db.doc('cards/live').get();
    expect(card.get('thin')).toBeUndefined();
    expect(card.get('signature.placeholder')).toBe(false);
  });

  it("keeps the model's placeholder on the signature and gives the card no vectors, however it scored", async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    await db.doc('cards/live').update({ story: 'lorem ipsum dolor sit amet lorem ipsum dolor sit amet' });
    mocks.reading = { placeholder: true };
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'unlisted' });
    expect(await vectorsOf('live')).toEqual({});
    expect((await db.doc('cards/live').get()).get('signature.placeholder')).toBe(true);
  });
});

// Round 26 §A1.6: the reading, server-only; the card keeps only what its pages need.
describe('the reading', () => {
  const reading = async () => (await db.doc('cardSignatures/live').get()).data();

  it("keeps the whole reading in cardSignatures, and on the card its through line, placeholder flag and hash — the older fields gone", async () => {
    await db.doc('cards/live').update({ signature: { coreInsight: 'old', intent: 'to record', situation: 'old', lifeDomain: 'x', emotionalRegister: 'y', insightScore: 0.7, placeholder: false } });
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    const card = (await db.doc('cards/live').get()).data()!;
    expect(Object.keys(card.signature).sort()).toEqual(['contentHash', 'coreInsight', 'placeholder']);
    expect(card.signature).toMatchObject({ coreInsight: 'Keeping one letter', placeholder: false });
    expect(card.indexPendingAt).toBeUndefined();
    expect(await reading()).toMatchObject({
      authorId: 'alice',
      version: 3,
      model: 'gpt-6.2-sol',
      embedModel: 'text-embedding-3-small',
      insights: [strongInsight],
      throughLine: 'Keeping one letter',
      moodOnly: false,
      insightScore: 0.9,
      listedForStrangers: true,
      templated: false,
      rewritten: false,
      error: null,
      usage: { input: 1000, output: 500, reasoning: 300, embed: 40 },
    });
    // The parts carry the hit's short lines — never the quote, never the reader line.
    const part = (await db.doc('cardVectors/live__insight__0').get()).data()!;
    expect(part).toMatchObject({ part: 0, coreInsight: 'Letting go is a kind of keeping.', situation: 'clearing out a drawer', embedModel: 'text-embedding-3-small', span: 'tonight' });
    expect(JSON.stringify(part)).not.toMatch(/I cleared out the drawer|moving house/);
  });

  it('embeds each strong insight as its own parts, and a later reading with fewer leaves no stray part', async () => {
    mocks.reading = { insights: [strongInsight, { ...strongInsight, insight: 'Second', strength: 0.7 }, { ...strongInsight, insight: 'Weak', strength: 0.2 }] };
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 4 });
    const ids = async () => (await db.collection('cardVectors').where('cardId', '==', 'live').get()).docs.map((d) => d.id).sort();
    expect(await ids()).toEqual(['live__insight__0', 'live__insight__1', 'live__situation__0', 'live__situation__1']);
    mocks.reading = {};
    expect(await indexCard('live', { force: true })).toEqual({ indexed: true, channels: 2 });
    expect(await ids()).toEqual(['live__insight__0', 'live__situation__0']);
  });

  it('keeps a card the reading finds feeling only out of the pool: read, published, not for strangers', async () => {
    await indexCard('live');
    mocks.reading = { moodOnly: true };
    expect(await indexCard('live', { force: true })).toEqual({ indexed: false, reason: 'unlisted' });
    expect(await vectorsOf('live')).toEqual({});
    expect(await reading()).toMatchObject({ moodOnly: true, listedForStrangers: false });
    expect((await db.doc('cards/live').get()).get('publishedAt')).toBeDefined();
  });

  it("records a reading cut at its cap, keeps the card owed and its last reading, and the next run settles it", async () => {
    await indexCard('live');
    await db.doc('cards/live').update({ story: 'I cleared out the drawer tonight, and kept the key too.' });
    mocks.next = [() => { throw new ChatIncomplete('length', ''); }];
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'failed' });
    expect(await reading()).toMatchObject({ error: 'length', listedForStrangers: true, throughLine: 'Keeping one letter' });
    expect((await db.doc('cards/live').get()).get('indexPendingAt')).toBeInstanceOf(Timestamp);
    expect(await vectorsOf('live')).toEqual({ insight: 'public', situation: 'public' });
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect((await db.doc('cards/live').get()).get('indexPendingAt')).toBeUndefined();
    expect(await reading()).toMatchObject({ error: null });
  });

  it('says so when the reading model refused and the older prompt read it instead', async () => {
    mocks.next = [() => ({ error: 'refusal', model: 'gpt-5.4-mini-2026-03-17' })];
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(await reading()).toMatchObject({ error: 'refusal', model: 'gpt-5.4-mini-2026-03-17' });
  });

  it('asks once more for a reading in formula phrasings — only when told to (the cron, the backfill), never on publish', async () => {
    mocks.reading = { throughLine: '真正的放下是留下一封信' };
    await indexCard('live');
    expect(mocks.signed).toBe(1);
    expect(await reading()).toMatchObject({ templated: true, rewritten: false });
    mocks.next = [() => ({}), () => ({ reading: { throughLine: 'Keeping one letter' } as CardReading })];
    await indexCard('live', { force: true, rewrite: true });
    expect(mocks.signed).toBe(3);
    expect(mocks.asked.at(-1)!.avoid).toEqual(['真正']);
    expect(await reading()).toMatchObject({ templated: false, rewritten: true, throughLine: 'Keeping one letter' });
  });
});

// §A1.9 (D10): under the emulators no model is asked — none of a test card's words leave the machine — and the
// emulator still has a pool to match on.
describe('indexing offline', () => {
  it("writes a fixed reading and vectors derived from the card's id, the same every time, under the stand-in model", async () => {
    mocks.offline = true;
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(mocks.signed).toBe(0);
    const reading = (await db.doc('cardSignatures/live').get()).data()!;
    expect(reading).toMatchObject({ model: 'offline', embedModel: 'offline', listedForStrangers: true, usage: { input: 0, output: 0, embed: 0 } });
    const vector = (await db.doc('cardVectors/live__insight__0').get()).get('vector').toArray();
    expect(vector).toEqual(offlineVector('live', { channel: 'insight', part: 0 }));
    expect(vector).toHaveLength(1536);
    expect(offlineVector('live', { channel: 'insight', part: 0 })).toEqual(vector);
    expect(offlineVector('other', { channel: 'insight', part: 0 })).not.toEqual(vector);
  });
});

// §A1.8: applying an edit marks the reading owed; the daily cron reads owed cards again, at most a few a run.
describe('the daily re-reading of owed cards', () => {
  it('reads an edited card again, settles an unchanged one without a call, and asks a templated reading once more', async () => {
    await indexCard('live');
    await db.doc('cards/other').set({ authorId: 'alice', thoughtCore: 'Another', story: 'Another story about the drawer, the second one.', visibility: 'public', publishedAt: published });
    mocks.reading = { throughLine: '不是丟掉，而是留下' };
    await indexCard('other');
    mocks.reading = {};
    // live: edited (owed); other: templated, not asked again yet.
    await db.doc('cards/live').update({ story: 'I cleared out the drawer tonight, and kept the key.' });
    await markIndexOwed(db, 'live');
    await markIndexOwed(db, 'gone');
    const before = mocks.signed;
    const run = await indexOwed(db);
    expect(mocks.signed - before).toBe(2);
    expect(run).toMatchObject({ examined: 2, read: 2, left: 0 });
    expect(run.tokens.input).toBeGreaterThan(0);
    expect((await db.doc('cards/live').get()).get('indexPendingAt')).toBeUndefined();
    expect((await db.doc('cardSignatures/other').get()).get('rewritten')).toBe(false);
    // Nothing owed now: a second run asks nothing.
    await markIndexOwed(db, 'live');
    const again = await indexOwed(db);
    expect(again.outcomes).toEqual({ unchanged: 1 });
    expect(again.read).toBe(0);
  });

  it('stops at its limit and leaves the rest for tomorrow', async () => {
    for (const id of ['c1', 'c2', 'c3']) {
      await db.doc(`cards/${id}`).set({ authorId: 'alice', thoughtCore: `Card ${id}`, story: `A story for ${id}, long enough to be read.`, visibility: 'public', publishedAt: published });
      await markIndexOwed(db, id);
    }
    const run = await indexOwed(db, { limit: 2 });
    expect(run).toMatchObject({ read: 2, left: 1 });
  });
});

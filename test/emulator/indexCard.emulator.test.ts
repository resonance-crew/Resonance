import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { restoreCard, trashCard } from '@/lib/api/v1/trash';
import { indexCard } from '@/lib/recommend/indexCard';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';
import type { InsightSignature } from '@/lib/db/types';

// The recommender's write-time pipeline (indexCard) against the Firestore
// emulator, with the LLM and the embeddings stood in for. Publish and apply
// start it after their response and it takes seconds, so a card can go to
// the trash — and come back — while it runs. Restoring a card only gives its
// vectors their visibility back (it runs where OpenAI can't be reached), so a
// card the trash met here must still have its vectors, private while there.

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
  /** Runs inside the signature's LLM call. */
  whileSigning: null as (() => Promise<unknown>) | null,
  /** How many signatures were asked of the LLM. */
  signed: 0,
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/ai/tasks', async (original) => ({
  ...(await original<typeof import('@/lib/ai/tasks')>()),
  extractInsightSignature: async (): Promise<InsightSignature> => (mocks.signed++, await mocks.whileSigning?.(), {
    coreInsight: 'Letting go is a kind of keeping.',
    intent: 'to record',
    situation: 'clearing out a drawer',
    lifeDomain: '日常',
    emotionalRegister: 'quiet',
    insightScore: 0.9,
  }),
}));
vi.mock('@/lib/ai/openai', async (original) => ({
  ...(await original<typeof import('@/lib/ai/openai')>()),
  embed: async (texts: string[]) => {
    await mocks.whileEmbedding?.();
    return texts.map(() => [0.1, 0.2, 0.3]);
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
  mocks.whileSigning = null;
  mocks.signed = 0;
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

describe('indexing a card the trash reaches meanwhile', () => {
  it('indexes a card trashed while the LLM ran, its vectors private, and the restore brings them back public', async () => {
    mocks.whileEmbedding = trash;
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(await vectorsOf('live')).toEqual({ insight: 'private', situation: 'private' });
    // Never lost: the signature is the card's too.
    expect((await db.doc('cards/live').get()).get('signature')).toMatchObject({ coreInsight: 'Letting go is a kind of keeping.' });

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
    await db.doc('cards/live').update({ story: 'Another story.', visibility: 'private' });
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
      await db.doc('cards/live').update({ story: 'Saved again while indexing.' });
    };
    await indexCard('live');
    expect((await db.doc('cards/live').get()).get('signature.contentHash')).toBeUndefined();
    await indexCard('live');
    expect(mocks.signed).toBe(2);
    expect((await db.doc('cards/live').get()).get('signature.contentHash')).toEqual(expect.any(String));
  });
});

// A reader's profile is built from their own vectors of one channel (lib/recommend/profile).
describe('FirestoreVectorStore.listByAuthor', () => {
  it("answers one author's vectors of one channel, with two equality filters and no composite index", async () => {
    const store = new FirestoreVectorStore(db);
    const record = (cardId: string, authorId: string, channel: 'insight' | 'situation', vector: number[]) => ({
      cardId, authorId, channel, vector, visibility: 'public' as const, insightScore: 0.9, coreInsight: 'c', situation: 's', lifeDomain: 'd',
    });
    await store.upsert([
      record('a1', 'alice', 'insight', [1, 0, 0]),
      record('a1', 'alice', 'situation', [0, 1, 0]),
      record('a2', 'alice', 'insight', [0, 0, 1]),
      record('b1', 'bob', 'insight', [1, 1, 0]),
    ]);
    const mine = await store.listByAuthor('alice', 'insight');
    expect(mine.sort((x, y) => x.cardId.localeCompare(y.cardId))).toEqual([
      { cardId: 'a1', vector: [1, 0, 0] },
      { cardId: 'a2', vector: [0, 0, 1] },
    ]);
    expect(await store.listByAuthor('alice', 'situation')).toEqual([{ cardId: 'a1', vector: [0, 1, 0] }]);
  });
});

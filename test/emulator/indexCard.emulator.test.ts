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
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/ai/tasks', async (original) => ({
  ...(await original<typeof import('@/lib/ai/tasks')>()),
  extractInsightSignature: async (): Promise<InsightSignature> => ({
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

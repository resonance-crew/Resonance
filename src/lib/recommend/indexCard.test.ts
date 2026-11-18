import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { ChatIncomplete } from '@/lib/ai/openai';
import type { CardReading } from '@/lib/db/types';
import type { CardReadingResult, ReadCardOptions } from '@/lib/ai/tasks';
import type { IVectorStore } from './vectorStore/interfaces';
import type { VectorRecord } from './vectorStore/types';

// A card's reading (`cardSignatures/{id}`, round 26 §A1.6) goes with the card:
// deleteCard deletes both in one transaction. indexCard writes the reading
// after the models ran — seconds, up to its deadline — so a card deleted for
// good meanwhile (an installed app's 刪除, the trash's 永久刪除) must not get it
// written back, on any path: the listed one (after the embeddings), the
// unlisted one, and a failed reading's record. The emulator suite
// (test/emulator/indexCard.emulator.test.ts) holds the rest of the pipeline.

const mocks = vi.hoisted(() => ({
  db: null as Firestore | null,
  store: null as IVectorStore | null,
  /** Runs inside the reading's LLM call. */
  whileSigning: null as (() => Promise<unknown>) | null,
  /** Runs inside the embedding call. */
  whileEmbedding: null as (() => Promise<unknown>) | null,
  /** Runs inside the vector store's deleteByCard (the unlisted path calls it just before the reading is kept). */
  whileUnlisting: null as (() => Promise<unknown>) | null,
  /** The next answer of the stand-in model (a function: throw, or a reading). */
  next: null as (() => Partial<CardReadingResult>) | null,
  reading: {} as Partial<CardReading>,
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/text/translation', async (original) => ({
  ...(await original<typeof import('@/lib/text/translation')>()),
  modelsOffline: () => false,
}));
vi.mock('@/lib/ai/tasks', async (original) => ({
  ...(await original<typeof import('@/lib/ai/tasks')>()),
  readCard: async (_input: unknown, opts: ReadCardOptions = {}): Promise<CardReadingResult> => {
    await mocks.whileSigning?.();
    opts.onUsage?.({ input: 1000, output: 500, reasoning: 300 });
    const next = mocks.next?.();
    return {
      model: 'gpt-6.2-sol',
      error: null,
      ...next,
      reading: {
        insights: [
          {
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
          },
        ],
        throughLine: 'Keeping one letter',
        moodOnly: false,
        insightScore: 0.9,
        lifeDomain: '日常',
        emotionalRegister: 'quiet',
        placeholder: false,
        ...mocks.reading,
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

import { deleteCard } from '@/lib/api/v1/cards';
import { indexCard } from './indexCard';

let fake: FakeAdminDb;
/** The card's vector parts as the in-memory store holds them. */
let vectors: Map<string, VectorRecord[]>;

/** The fake's document refs, given the `firestore` an Admin SDK ref carries (markIndexed's transaction runs on it). */
function withRefFirestore(db: Firestore): Firestore {
  const loose = db as unknown as { collection: (name: string) => Record<string, unknown> & { doc: (id?: string) => object } };
  const collection = loose.collection;
  loose.collection = (name: string) => {
    const col = collection(name);
    return { ...col, doc: (id?: string) => Object.assign(col.doc(id), { firestore: db }) };
  };
  return db;
}

const STORY = 'I cleared out the drawer tonight. Every letter in it had a reason to stay, and I kept only one of them, the one my grandmother wrote the winter before she moved.';

beforeEach(() => {
  fake = fakeAdminDb({
    'cards/live': {
      authorId: 'alice',
      thoughtCore: 'A drawer',
      story: STORY,
      tags: [],
      visibility: 'public',
      anonymous: false,
      slug: 'a-drawer',
      publishedAt: Timestamp.fromDate(new Date('2026-10-20T08:00:00Z')),
      resonanceCount: 0,
    },
  });
  mocks.db = withRefFirestore(fake.db);
  vectors = new Map();
  mocks.store = {
    upsert: async (records) => {
      for (const r of records) vectors.set(r.cardId, [...(vectors.get(r.cardId) ?? []), r]);
    },
    deleteByCard: async (cardId) => {
      const during = mocks.whileUnlisting;
      mocks.whileUnlisting = null;
      await during?.();
      vectors.delete(cardId);
    },
    setVisibility: async () => {},
    nearest: async () => [],
    listByVisibility: async () => [],
    listByCards: async () => [],
  };
  mocks.whileSigning = null;
  mocks.whileEmbedding = null;
  mocks.whileUnlisting = null;
  mocks.next = null;
  mocks.reading = {};
});

/** The author deletes the card for good (DELETE /api/v1/cards/{id}, the trash's 永久刪除): the card and its reading in one transaction. */
const deleteForGood = () => deleteCard(fake.db, 'alice', 'live', { vectors: mocks.store! });

describe("indexCard and a card deleted for good while it runs", () => {
  it('keeps the reading of a card that is still there', async () => {
    expect(await indexCard('live')).toEqual({ indexed: true, channels: 2 });
    expect(fake.docs['cardSignatures/live']).toMatchObject({ authorId: 'alice', listedForStrangers: true, throughLine: 'Keeping one letter' });
    expect(vectors.get('live')).toHaveLength(2);
  });

  it('writes no reading back for a card deleted while its parts were embedded', async () => {
    mocks.whileEmbedding = deleteForGood;
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'not-found' });
    expect(fake.docs['cards/live']).toBeUndefined();
    expect(fake.docs['cardSignatures/live']).toBeUndefined();
    expect(vectors.has('live')).toBe(false);
  });

  it('writes no reading back for an unlisted card deleted before its reading was kept', async () => {
    // Feeling only: not for strangers, so no vectors — the reading is still kept, while the card is there.
    mocks.reading = { moodOnly: true };
    mocks.whileUnlisting = deleteForGood;
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'not-found' });
    expect(fake.docs['cardSignatures/live']).toBeUndefined();
  });

  it('keeps the reading of an unlisted card that is still there', async () => {
    mocks.reading = { moodOnly: true };
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'unlisted' });
    expect(fake.docs['cardSignatures/live']).toMatchObject({ listedForStrangers: false, moodOnly: true });
  });

  it('records no failed reading for a card deleted while the model was asked', async () => {
    mocks.whileSigning = deleteForGood;
    mocks.next = () => {
      throw new ChatIncomplete('length', 'max_output_tokens');
    };
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'failed' });
    expect(fake.docs['cardSignatures/live']).toBeUndefined();
  });

  it("records a failed reading beside a card that is still there", async () => {
    mocks.next = () => {
      throw new ChatIncomplete('length', 'max_output_tokens');
    };
    expect(await indexCard('live')).toEqual({ indexed: false, reason: 'failed' });
    expect(fake.docs['cardSignatures/live']).toMatchObject({ authorId: 'alice', error: 'length' });
  });
});

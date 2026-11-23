import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Query, type Firestore } from 'firebase-admin/firestore';
import { FirestoreVectorStore, vectorDocId } from '@/lib/recommend/vectorStore/firestore';

// The vector store's reads against the Firestore emulator: a taste of many cards
// is read 30 cards a query, the queries side by side (B9), every part found.

const PROJECT = 'demo-resonance-vector-store';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'vector-store-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

describe('listByCards', () => {
  it('reads 70 cards in three queries at once, every part with its vector', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `c${String(i).padStart(2, '0')}`);
    const batch = db.batch();
    for (const id of ids) {
      batch.set(db.doc(`cardVectors/${vectorDocId(id, 'insight', 0)}`), {
        cardId: id, authorId: 'a', visibility: 'public', channel: 'insight', part: 0, vector: FieldValue.vector([1, 0]), embedModel: 'm',
      });
    }
    await batch.commit();

    let inFlight = 0;
    let most = 0;
    const real = Query.prototype.get;
    const get = vi.spyOn(Query.prototype, 'get').mockImplementation(async function (this: Query) {
      most = Math.max(most, ++inFlight);
      try {
        return await real.call(this);
      } finally {
        inFlight--;
      }
    });
    try {
      const records = await new FirestoreVectorStore(db).listByCards([...ids, 'missing']);
      expect(records.map((r) => r.cardId).sort()).toEqual(ids);
      expect(records[0].vector).toEqual([1, 0]);
      expect(get).toHaveBeenCalledTimes(3);
      expect(most).toBe(3);
    } finally {
      get.mockRestore();
    }
  });
});

describe('listChangedSince (P0 #7: what is laid over the packed pool)', () => {
  it('answers every part written or whose visibility changed after the time, of any visibility, and null past the most', async () => {
    const store = new FirestoreVectorStore(db);
    const part = (cardId: string) => ({
      cardId, authorId: 'a', visibility: 'public' as const, channel: 'insight' as const, part: 0, vector: [1, 0], embedModel: 'm',
      insightScore: 0.5, coreInsight: '', situation: '', lifeDomain: '', span: '',
    });
    await store.upsert([part('before')]);
    await store.upsert([part('hidden')]);
    await new Promise((r) => setTimeout(r, 50));
    const since = new Date();
    await new Promise((r) => setTimeout(r, 50));
    await store.upsert([part('after')]);
    await store.setVisibility('hidden', 'private');

    const changed = await store.listChangedSince(since, 10);
    expect(changed!.map((r) => [r.cardId, r.visibility]).sort()).toEqual([['after', 'public'], ['hidden', 'private']]);
    expect(changed![0].vector).toEqual([1, 0]);
    expect(await store.listChangedSince(since, 1)).toBeNull();
  });
});

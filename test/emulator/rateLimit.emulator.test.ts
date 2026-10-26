import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { LIMITS, limited, spend, spendAll } from '@/lib/api/rateLimit';

// The API's per-user budgets (lib/api/rateLimit) against the Firestore
// emulator: counted in a transaction, refused with 429 once spent, reset by
// the next window, and kept per user and per bucket.

const PROJECT = 'demo-resonance-rate-limit';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'rate-limit-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

const T0 = Date.UTC(2026, 8, 30, 12);

async function refusal(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('spend', () => {
  it('allows the budget, then refuses with rate_limited until the window turns', async () => {
    const { max, windowMs } = LIMITS.illustration;
    for (let i = 0; i < max; i++) await spend(db, 'alice', 'illustration', 1, T0 + i);
    expect((await refusal(spend(db, 'alice', 'illustration', 1, T0 + max))).code).toBe('rate_limited');
    // Someone else, and another bucket, are untouched.
    await spend(db, 'bob', 'illustration', 1, T0);
    await spend(db, 'alice', 'tags', 1, T0);
    // A new window starts over.
    await spend(db, 'alice', 'illustration', 1, T0 + windowMs);
    const doc = await db.doc('rateLimits/alice_illustration').get();
    expect(doc.data()).toMatchObject({ userId: 'alice', bucket: 'illustration', windowStart: T0 + windowMs, used: 1 });
  });

  it('counts a weight (upload bytes) against the budget', async () => {
    const { max } = LIMITS.uploadBytes;
    await spend(db, 'alice', 'uploadBytes', max - 10, T0);
    await refusal(spend(db, 'alice', 'uploadBytes', 11, T0 + 1));
    await spend(db, 'alice', 'uploadBytes', 10, T0 + 2);
  });

  it('gives resonating with a written card 20 a day: a reader picking cards, never a script ringing (and connecting with) everyone', async () => {
    expect(LIMITS.resonate).toEqual({ max: 20, windowMs: 24 * 60 * 60 * 1000 });
    for (let i = 0; i < 20; i++) await spend(db, 'erin', 'resonate', 1, T0 + i);
    expect((await refusal(spend(db, 'erin', 'resonate', 1, T0 + 20))).code).toBe('rate_limited');
    // Publishing a written resonance keeps its own budget.
    await spend(db, 'erin', 'publish', 1, T0 + 21);
    await spend(db, 'erin', 'resonate', 1, T0 + LIMITS.resonate.windowMs);
  });

  it('never lets concurrent requests overspend', async () => {
    const { max } = LIMITS.illustration;
    const results = await Promise.allSettled(Array.from({ length: max + 5 }, () => spend(db, 'carol', 'illustration', 1, T0)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(max);
    expect((await db.doc('rateLimits/carol_illustration').get()).get('used')).toBe(max);
  });
});

// A picture's count and its bytes, in one transaction: what spending them one after the other did.
describe('spendAll', () => {
  const used = async (doc: string) => (await db.doc(`rateLimits/${doc}`).get()).get('used');

  it('spends each bucket in order; the first without room refuses, those before it stay spent, those after it untouched', async () => {
    await spendAll(db, 'erin', [['chatImage'], ['chatImageBytes', 1_000]], T0);
    expect([await used('erin_chatImage'), await used('erin_chatImageBytes')]).toEqual([1, 1_000]);
    const { max } = LIMITS.chatImageBytes;
    expect((await refusal(spendAll(db, 'erin', [['chatImage'], ['chatImageBytes', max]], T0 + 1))).code).toBe('rate_limited');
    expect([await used('erin_chatImage'), await used('erin_chatImageBytes')]).toEqual([2, 1_000]);
    await db.doc('rateLimits/erin_upload').set({ userId: 'erin', bucket: 'upload', windowStart: T0, used: LIMITS.upload.max });
    expect((await refusal(spendAll(db, 'erin', [['upload'], ['uploadBytes', 10]], T0 + 2))).code).toBe('rate_limited');
    expect((await db.doc('rateLimits/erin_uploadBytes').get()).exists).toBe(false);
  });

  it('never lets concurrent requests overspend either bucket', async () => {
    const { max } = LIMITS.illustration;
    const results = await Promise.allSettled(Array.from({ length: max + 5 }, () => spendAll(db, 'carol', [['illustration'], ['uploadBytes', 10]], T0)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(max);
    // The count comes first: a request it refuses spends no bytes.
    expect([await used('carol_illustration'), await used('carol_uploadBytes')]).toEqual([max, max * 10]);
  });
});

describe('limited', () => {
  it('answers the routes outside v1 with a 429 ApiError body', async () => {
    for (let i = 0; i < LIMITS.illustration.max; i++) expect(await limited(db, 'dana', 'illustration')).toBeNull();
    const res = await limited(db, 'dana', 'illustration');
    expect(res?.status).toBe(429);
    expect(await res?.json()).toEqual({ error: { code: 'rate_limited', message: expect.any(String) } });
  });

  it('spends several buckets at once when given a list', async () => {
    expect(await limited(db, 'dana', [['upload'], ['uploadBytes', 500]])).toBeNull();
    expect((await db.doc('rateLimits/dana_uploadBytes').get()).get('used')).toBe(500);
    const res = await limited(db, 'dana', [['upload'], ['uploadBytes', LIMITS.uploadBytes.max]]);
    expect(res?.status).toBe(429);
    expect((await db.doc('rateLimits/dana_upload').get()).get('used')).toBe(2);
  });
});

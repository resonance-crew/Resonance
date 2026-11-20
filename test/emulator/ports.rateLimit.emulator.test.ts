import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { spend } from '@/lib/api/rateLimit';
import { describeRateLimiterContract } from '@/server/contract/rateLimit.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { firestoreRateLimiter } from '@/server/infra/firestore/rateLimit';

// The Firestore RateLimiter against the same contract as the memory one
// (src/server/infra/memory/rateLimit.test.ts): real transactions on the
// emulator, in rateLimits/{uid}_{bucket}, each test with its own user ids.

const PROJECT = 'demo-resonance-ports-rate-limit';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-rate-limit-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

describeRateLimiterContract('Firestore (emulator)', () => ({
  limiter: firestoreRateLimiter(db),
  used: async (uid, bucket) => (await db.doc(`rateLimits/${uid}_${bucket}`).get()).get('used'),
}));

describe('the legacy facade and the context', () => {
  it('spend(db, …) and ctxFor(db).limits share one window, stored as before', async () => {
    const uid = `facade-${Date.now()}`;
    const T0 = Date.UTC(2026, 10, 21);
    await spend(db, uid, 'note', 1, T0);
    await ctxFor(db).limits.spend(uid, 'note', 2, T0 + 1);
    expect((await db.doc(`rateLimits/${uid}_note`).get()).data()).toEqual({ userId: uid, bucket: 'note', windowStart: T0, used: 3 });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { purgeAccount } from '@/lib/account/deletion';

// Other people's blocks of a purged account (任務 #3 Phase 0). Bob and Carol
// blocked Alice — `users/{them}/blocks/alice`, outside Alice's own tree — and
// those documents named her after her account was gone. The purge now takes
// them (collectAccountData: a collection group query on `blockedUid`, which
// indexGuard checks against firestore.indexes.json as production would), and
// leaves every other block and Bob's bookmark of her card alone.
// A sibling of accountPurge.emulator.test.ts: the existing suites stay as they are.

const PROJECT = 'demo-resonance-purge-blocks';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'account-purge-blocks-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

const exists = async (path: string) => (await db.doc(path).get()).exists;

describe('purging an account and the blocks naming it', () => {
  it("removes other people's blocks of the account, and keeps every other block and bookmark", async () => {
    const now = new Date();
    const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
    await Promise.all([
      set('users/alice', { handle: 'alice', handleLower: 'alice' }),
      set('users/alice/blocks/dave', { blockedUid: 'dave', createdAt: now }),
      set('cards/alice-card', { authorId: 'alice', thoughtCore: 'A', story: 's', visibility: 'public' }),
      set('users/bob', { handle: 'bob', handleLower: 'bob' }),
      set('users/bob/blocks/alice', { blockedUid: 'alice', createdAt: now }),
      set('users/bob/blocks/carol', { blockedUid: 'carol', createdAt: now }),
      set('users/bob/bookmarks/alice-card', { cardId: 'alice-card', createdAt: now }),
      set('users/carol', { handle: 'carol', handleLower: 'carol' }),
      set('users/carol/blocks/alice', { blockedUid: 'alice', createdAt: now }),
      set('users/dave/blocks/bob', { blockedUid: 'bob', createdAt: now }),
    ]);

    await purgeAccount({ db, deleteAuthUser: vi.fn(async () => {}) }, 'alice');

    for (const gone of ['users/alice', 'users/alice/blocks/dave', 'cards/alice-card', 'users/bob/blocks/alice', 'users/carol/blocks/alice']) {
      expect(await exists(gone), gone).toBe(false);
    }
    for (const kept of ['users/bob', 'users/bob/blocks/carol', 'users/bob/bookmarks/alice-card', 'users/carol', 'users/dave/blocks/bob']) {
      expect(await exists(kept), kept).toBe(true);
    }
    // Nothing anywhere still names her as blocked.
    expect((await db.collectionGroup('blocks').where('blockedUid', '==', 'alice').get()).size).toBe(0);
  });
});

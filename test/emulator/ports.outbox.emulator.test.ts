import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { replicate } from '@/server/app/replicate';
import { CHANGE_LOG } from '@/server/domain/outbox';
import { firestoreChangeSource } from '@/server/infra/firestore/changeLog';
import { FirestoreUnitOfWork } from '@/server/infra/firestore/uow';
import { MemoryState } from '@/server/infra/memory/state';
import { memoryReplicaTarget } from '@/server/infra/memory/replica';
import { pgReplicaTarget } from '@/server/infra/postgres/replica';
import { lazyPgTestDb, PG_TEST_URL } from '@/server/infra/postgres/testing';

// The transactional outbox on Firestore (plan section 4.3, Phase 3): with
// OUTBOX_ENABLED off a transaction writes nothing more; on, one
// `changeLog/{ulid}` per row it wrote, in the same transaction — a failed one
// writes none — holding which row, never what it holds. Then the replicator
// from the emulator into memory (and PostgreSQL, with PG_TEST_URL), replayed:
// the target ends the same.

const PROJECT = 'demo-resonance-ports-outbox';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-outbox-test');
  db = getFirestore(app);
});

const pg = lazyPgTestDb();
afterAll(async () => {
  await pg.close();
  await deleteApp(app);
});

type Tx = Parameters<Parameters<Firestore['runTransaction']>[0]>[0];
interface RawTx {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}
const raw = (fdb: Firestore, tx: Tx): RawTx => ({
  get: async (path) => (await tx.get(fdb.doc(path))).data() ?? null,
  set: (path, data) => void tx.set(fdb.doc(path), data),
  delete: (path) => void tx.delete(fdb.doc(path)),
});

let run = 0;
const ids = () => {
  const p = `ob${Date.now().toString(36)}${++run}`;
  return { card: `${p}card`, a: `${p}a`, b: `${p}b` };
};

/** Every changeLog entry naming one of these row ids. */
async function entriesFor(...rowIds: string[]): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(CHANGE_LOG).get();
  return snap.docs.map((d) => ({ logId: d.id, ...d.data() }) as Record<string, unknown>).filter((e) => rowIds.some((id) => String(e.id).includes(id)));
}

/** Mark every pending entry (other tests') done, into a target nobody reads. */
const drain = () => replicate(firestoreChangeSource(db), memoryReplicaTarget(new MemoryState()));

describe('the outbox (Firestore emulator)', () => {
  it('off: a transaction writes its rows and nothing else', async () => {
    const { card } = ids();
    const uow = new FirestoreUnitOfWork<RawTx>(db, raw, () => false);
    await uow.run(async (tx) => tx.set(`cards/${card}`, { authorId: 'x', visibility: 'public' }));
    expect(await entriesFor(card)).toEqual([]);
  });

  it('on: one entry per row written, in ulid order, which row and how — never its content', async () => {
    const { card, a, b } = ids();
    const uow = new FirestoreUnitOfWork<RawTx>(db, raw, () => true);
    await uow.run(async (tx) => {
      await tx.get(`cards/${card}`);
      tx.set(`cards/${card}`, { authorId: a, visibility: 'public', story: 'secret words' });
      tx.set(`cards/${card}`, { authorId: a, visibility: 'public', story: 'secret words, again' });
      tx.set(`users/${a}/blocks/${b}`, { blockedUid: b, createdAt: new Date() });
      tx.delete(`resonanceTaps/${card}_${b}`);
    });
    const entries = (await entriesFor(card, b)).sort((x, y) => (String(x.logId) < String(y.logId) ? -1 : 1));
    expect(entries.map((e) => [e.entity, e.id, e.op])).toEqual([
      ['cards', card, 'upsert'],
      ['blocks', `${a}/${b}`, 'upsert'],
      ['resonanceTaps', `${card}_${b}`, 'delete'],
    ]);
    for (const e of entries) {
      expect(Object.keys(e).sort()).toEqual(['at', 'done', 'entity', 'expireAt', 'id', 'logId', 'op', 'userIds', 'version']);
      expect(JSON.stringify(e)).not.toContain('secret');
    }
    // The uids the ids name, so an account's purge finds its entries.
    expect(entries[1].userIds).toEqual([a, b].sort());
  });

  it('a transaction that fails writes no entry, as it writes no row', async () => {
    const { card } = ids();
    const uow = new FirestoreUnitOfWork<RawTx>(db, raw, () => true);
    await expect(
      uow.run(async (tx) => {
        tx.set(`cards/${card}`, { authorId: 'x' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await entriesFor(card)).toEqual([]);
    expect((await db.doc(`cards/${card}`).get()).exists).toBe(false);
  });

  it('replicates into memory: the latest rows, deletes included; a replay changes nothing', async () => {
    await drain();
    const { card, a, b } = ids();
    const uow = new FirestoreUnitOfWork<RawTx>(db, raw, () => true);
    await uow.run(async (tx) => {
      tx.set(`cards/${card}`, { authorId: a, visibility: 'public', publishedAt: new Date('2026-11-20T00:00:00Z') });
      tx.set(`users/${a}/blocks/${b}`, { blockedUid: b });
    });
    await uow.run(async (tx) => tx.set(`cards/${card}`, { authorId: a, visibility: 'private', publishedAt: new Date('2026-11-20T00:00:00Z') }));
    await uow.run(async (tx) => tx.delete(`users/${a}/blocks/${b}`));

    const target = new MemoryState();
    const first = await replicate(firestoreChangeSource(db), memoryReplicaTarget(target));
    expect(first).toMatchObject({ seen: 4, applied: 2 });
    expect(target.get('cards', card)).toEqual({ authorId: a, visibility: 'private', publishedAt: new Date('2026-11-20T00:00:00Z') });
    expect(target.get(`users/${a}/blocks`, b)).toBeNull();

    // A replay: the same entries again (as after a run cut short before marking them done).
    const snap = await db.collection(CHANGE_LOG).where('done', '==', true).get();
    await Promise.all(snap.docs.filter((d) => String(d.get('id')).includes(card) || String(d.get('id')).includes(b)).map((d) => d.ref.update({ done: false })));
    const before = target.dump();
    const replay = await replicate(firestoreChangeSource(db), memoryReplicaTarget(target));
    expect(replay.seen).toBe(4);
    expect(target.dump().cards).toEqual(before.cards);
    expect(target.get('cards', card)).toEqual({ authorId: a, visibility: 'private', publishedAt: new Date('2026-11-20T00:00:00Z') });
  });

  it.skipIf(!PG_TEST_URL)('replicates into PostgreSQL, idempotent on replay (PG_TEST_URL)', async () => {
    await drain();
    const { card, a } = ids();
    const pdb = await pg.get();
    const uow = new FirestoreUnitOfWork<RawTx>(db, raw, () => true);
    await uow.run(async (tx) => tx.set(`cards/${card}`, { authorId: a, visibility: 'public', readCount: 2, tags: ['x'] }));
    const target = pgReplicaTarget(pdb.pool);
    expect(await replicate(firestoreChangeSource(db), target)).toMatchObject({ seen: 1, applied: 1 });
    const snap = await db.collection(CHANGE_LOG).where('id', '==', card).get();
    await Promise.all(snap.docs.map((d) => d.ref.update({ done: false })));
    expect(await replicate(firestoreChangeSource(db), target)).toMatchObject({ seen: 1, applied: 0, stale: 1 });
    expect(await pdb.docs.get('cards', card)).toEqual({ authorId: a, visibility: 'public', readCount: 2, tags: ['x'] });
  });
});

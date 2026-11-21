import type { AdminDb } from '@/server/infra/firestore/db';
import type { MemoryState } from '@/server/infra/memory/state';
import type { MemoryTx } from '@/server/infra/memory/uow';
import type { UnitOfWork } from '@/server/ports/uow';

/**
 * A test-only repository for the UnitOfWork contract: numbers by key in a
 * `probe` table (a collection of the emulator's own, never a production
 * aggregate). Reads are asynchronous, writes synchronous, as every repo's.
 */
export interface ProbeTx {
  get(key: string): Promise<number | null>;
  set(key: string, n: number): void;
  delete(key: string): void;
}

/** What a contract suite needs from an adapter: a UoW over the probe, and a look at what was committed. */
export interface ProbeHarness {
  uow: UnitOfWork<ProbeTx>;
  /** The committed value, read outside any transaction. */
  peek(key: string): Promise<number | null>;
}

const n = (v: unknown) => (typeof v === 'number' ? v : null);

/** The probe inside a memory transaction (table `probe`). */
export function memoryProbe(tx: MemoryTx): ProbeTx {
  return {
    get: async (key) => n(tx.get('probe', key)?.n),
    set: (key, value) => tx.put('probe', key, { n: value }),
    delete: (key) => tx.delete('probe', key),
  };
}

export function memoryPeek(state: MemoryState) {
  return async (key: string) => n(state.get('probe', key)?.n);
}

/** The admin SDK's Transaction, named without importing the SDK (src/server/ratchet.test.ts). */
type FirestoreTx = Parameters<Parameters<AdminDb['runTransaction']>[0]>[0];

/** The probe inside a Firestore transaction (collection `collection`, one per suite run). */
export function firestoreProbe(collection: string) {
  return (db: AdminDb, tx: FirestoreTx): ProbeTx => ({
    get: async (key) => n((await tx.get(db.doc(`${collection}/${key}`))).get('n')),
    set: (key, value) => void tx.set(db.doc(`${collection}/${key}`), { n: value }),
    delete: (key) => void tx.delete(db.doc(`${collection}/${key}`)),
  });
}

export function firestorePeek(db: AdminDb, collection: string) {
  return async (key: string) => n((await db.doc(`${collection}/${key}`).get()).get('n'));
}

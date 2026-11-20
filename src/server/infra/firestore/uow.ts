import type { Transaction } from 'firebase-admin/firestore';
import { ReadAfterWriteError, type TxRepos, type UnitOfWork, type UowOptions } from '@/server/ports/uow';
import type { AdminDb } from './db';
import { buildTxRepos } from './repos';

/** Firestore's own refusal of a read after a write in the same transaction (the admin SDK's message). */
const READ_AFTER_WRITE = /reads to be executed before all writes/i;

/**
 * Transactions as `db.runTransaction` (serializable, retried by the SDK on
 * contention: `fn` may run again). `build` makes a transaction's repositories
 * — TxRepos in production (firestoreUow); a contract's probe in its suite.
 */
export class FirestoreUnitOfWork<R = TxRepos> implements UnitOfWork<R> {
  constructor(
    private readonly db: AdminDb,
    private readonly build: (db: AdminDb, tx: Transaction) => R,
  ) {}

  async run<T>(fn: (tx: R) => Promise<T>, opts: UowOptions = {}): Promise<T> {
    try {
      return await this.db.runTransaction((tx) => fn(this.build(this.db, tx)));
    } catch (e) {
      if (e instanceof Error && !(e instanceof ReadAfterWriteError) && READ_AFTER_WRITE.test(e.message)) {
        throw Object.assign(new ReadAfterWriteError(opts.label), { cause: e });
      }
      throw e;
    }
  }
}

/** The production UnitOfWork over this database. */
export function firestoreUow(db: AdminDb): UnitOfWork {
  return new FirestoreUnitOfWork<TxRepos>(db, buildTxRepos);
}

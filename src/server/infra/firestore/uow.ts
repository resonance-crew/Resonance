import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { CHANGE_LOG, changeEntry, entityOfPath } from '@/server/domain/outbox';
import { ReadAfterWriteError, type TxRepos, type UnitOfWork, type UowOptions } from '@/server/ports/uow';
import { ulid } from '../system/ulid';
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
    /** Whether to record the outbox; `OUTBOX_ENABLED=1` by default (off unless set). */
    private readonly outbox: () => boolean = outboxEnabled,
    private readonly now: () => number = Date.now,
  ) {}

  async run<T>(fn: (tx: R) => Promise<T>, opts: UowOptions = {}): Promise<T> {
    try {
      return await this.db.runTransaction(async (tx) => {
        if (!this.outbox()) return fn(this.build(this.db, tx));
        const written = new Map<string, 'upsert' | 'delete'>();
        const answer = await fn(this.build(this.db, recording(tx, written)));
        recordChanges(this.db, tx, written, this.now());
        return answer;
      });
    } catch (e) {
      if (e instanceof Error && !(e instanceof ReadAfterWriteError) && READ_AFTER_WRITE.test(e.message)) {
        throw Object.assign(new ReadAfterWriteError(opts.label), { cause: e });
      }
      throw e;
    }
  }
}

/** The outbox's switch (plan section 4.3): off unless `OUTBOX_ENABLED=1`. */
export function outboxEnabled(): boolean {
  return process.env.OUTBOX_ENABLED === '1';
}

const WRITES = new Set(['set', 'update', 'create', 'delete']);

/**
 * The transaction, with every write's document path noted in `written` —
 * the outbox's hook, so no repository has to report its writes. A path
 * written several times is one entry: its last op.
 */
function recording(tx: Transaction, written: Map<string, 'upsert' | 'delete'>): Transaction {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || !WRITES.has(prop) || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
      return (ref: DocumentReference, ...rest: unknown[]) => {
        written.set(ref.path, prop === 'delete' ? 'delete' : 'upsert');
        (value as (...a: unknown[]) => unknown).apply(target, [ref, ...rest]);
        return receiver;
      };
    },
  });
}

/** One `changeLog/{ulid}` per written row, created in the same transaction (its last writes). */
function recordChanges(db: AdminDb, tx: Transaction, written: Map<string, 'upsert' | 'delete'>, at: number): void {
  for (const [path, op] of written) {
    const { entity, id } = entityOfPath(path);
    if (entity === CHANGE_LOG) continue;
    tx.create(db.collection(CHANGE_LOG).doc(ulid(at)), changeEntry(entity, id, op, at));
  }
}

/** The production UnitOfWork over this database. */
export function firestoreUow(db: AdminDb): UnitOfWork {
  return new FirestoreUnitOfWork<TxRepos>(db, buildTxRepos);
}

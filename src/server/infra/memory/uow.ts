import { AsyncLocalStorage } from 'node:async_hooks';
import { CHANGE_LOG, changeEntry, entityOfPath } from '@/server/domain/outbox';
import { ReadAfterWriteError, type TxRepos, type UnitOfWork, type UowOptions } from '@/server/ports/uow';
import { ulid } from '../system/ulid';
import { buildMemoryTxRepos } from './repos';
import type { MemoryState, Row, StoredRow } from './state';

/**
 * Holds a transaction to Firestore's rule: every read before any write. A
 * repo calls `read()` before it reads and `write()` before it writes (or uses
 * MemoryTx's methods, which do).
 */
export class TxTracker {
  private wrote = false;

  constructor(private readonly label?: string) {}

  read(): void {
    if (this.wrote) throw new ReadAfterWriteError(this.label);
  }

  write(): void {
    this.wrote = true;
  }
}

type Op = { kind: 'put'; table: string; id: string; row: Row } | { kind: 'merge'; table: string; id: string; fields: Row } | { kind: 'delete'; table: string; id: string };

/**
 * One memory transaction: reads see the committed state (transactions run
 * one at a time, and no read may follow a write, so nothing else could be
 * seen); writes are kept aside and applied together when `fn` resolves —
 * none of them when it throws.
 */
export class MemoryTx {
  private readonly ops: Op[] = [];

  constructor(
    readonly state: MemoryState,
    readonly tracker: TxTracker,
  ) {}

  get<T extends Row = Row>(table: string, id: string): T | null {
    this.tracker.read();
    return this.state.get<T>(table, id);
  }

  rows<T extends Row = Row>(table: string, where?: (row: T, id: string) => boolean): StoredRow<T>[] {
    this.tracker.read();
    return this.state.rows<T>(table, where);
  }

  put(table: string, id: string, row: Row): void {
    this.tracker.write();
    this.ops.push({ kind: 'put', table, id, row: structuredClone(row) });
  }

  merge(table: string, id: string, fields: Row): void {
    this.tracker.write();
    this.ops.push({ kind: 'merge', table, id, fields: structuredClone(fields) });
  }

  delete(table: string, id: string): void {
    this.tracker.write();
    this.ops.push({ kind: 'delete', table, id });
  }

  /** The rows written, each with its last op (the outbox's record). */
  written(): { table: string; id: string; op: 'upsert' | 'delete' }[] {
    const out = new Map<string, { table: string; id: string; op: 'upsert' | 'delete' }>();
    for (const op of this.ops) {
      const key = JSON.stringify([op.table, op.id]);
      out.delete(key);
      out.set(key, { table: op.table, id: op.id, op: op.kind === 'delete' ? 'delete' : 'upsert' });
    }
    return [...out.values()];
  }

  /** Apply what was written (the UoW calls it once `fn` resolved). */
  commit(): void {
    for (const op of this.ops) {
      if (op.kind === 'put') this.state.put(op.table, op.id, op.row);
      else if (op.kind === 'merge') this.state.merge(op.table, op.id, op.fields);
      else this.state.delete(op.table, op.id);
    }
  }
}

export interface MemoryUowOptions {
  /** Record the outbox (`changeLog/{ulid}`) with each commit, as FirestoreUnitOfWork with `OUTBOX_ENABLED=1`. */
  outbox?: () => boolean;
  now?: () => number;
}

/**
 * Transactions over MemoryState, one at a time (as serializable as it gets).
 * `build` makes a transaction's repositories: TxRepos in memoryCtx, a probe
 * in the contract suites. A `run` inside another's `fn` throws instead of
 * waiting on itself.
 */
export class MemoryUnitOfWork<R = TxRepos> implements UnitOfWork<R> {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly inside = new AsyncLocalStorage<true>();

  constructor(
    private readonly state: MemoryState,
    private readonly build: (tx: MemoryTx) => R,
    private readonly opts: MemoryUowOptions = {},
  ) {}

  run<T>(fn: (tx: R) => Promise<T>, opts: UowOptions = {}): Promise<T> {
    if (this.inside.getStore()) return Promise.reject(new Error(`uow.run nested inside another transaction${opts.label ? ` (${opts.label})` : ''}`));
    const result = this.tail.then(() =>
      this.inside.run(true, async () => {
        const tx = new MemoryTx(this.state, new TxTracker(opts.label));
        const value = await fn(this.build(tx));
        if (this.opts.outbox?.()) {
          const at = (this.opts.now ?? Date.now)();
          // A memory table is a collection (`cards`) or a subcollection's path (`users/{uid}/blocks`); `blocks`
          // mirrors the latter by `{uid}/{other}`: one entry per row either way.
          const rows = new Map<string, { entity: string; id: string; op: 'upsert' | 'delete' }>();
          for (const { table, id, op } of tx.written()) {
            const row = table.includes('/') ? entityOfPath(`${table}/${id}`) : { entity: table, id };
            rows.set(`${row.entity}/${row.id}`, { ...row, op });
          }
          for (const { entity, id, op } of rows.values()) if (entity !== CHANGE_LOG) tx.put(CHANGE_LOG, ulid(at), { ...changeEntry(entity, id, op, at) });
        }
        tx.commit();
        return value;
      }),
    );
    this.tail = result.catch(() => {});
    return result;
  }
}

/** The memory UnitOfWork with every aggregate's repositories. */
export function memoryUow(state: MemoryState, opts: MemoryUowOptions = {}): UnitOfWork {
  return new MemoryUnitOfWork<TxRepos>(state, buildMemoryTxRepos, opts);
}

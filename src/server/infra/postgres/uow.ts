import { AsyncLocalStorage } from 'node:async_hooks';
import type { UnitOfWork, UowOptions } from '@/server/ports/uow';
import { TxTracker } from '../memory/uow';
import { ulid } from '../system/ulid';
import type { Doc } from './codec';
import { PgDocs, type Filter, type Queryable, type StoredDoc } from './docs';
import { resolveEntity } from './schema';
import { changeEntry } from '@/server/domain/outbox';

/** A pool that lends one client for a transaction (pg's Pool). */
export interface PgPool extends Queryable {
  connect(): Promise<Queryable & { release(err?: Error | boolean): void }>;
}

type Op = (docs: PgDocs) => Promise<void>;

/**
 * One PostgreSQL transaction as the repositories see it, MemoryTx's shape
 * with reads awaited: reads run at once inside the serializable
 * transaction; writes are synchronous, kept aside and run in order just
 * before the commit (`flush`) — so a read can never see the transaction's
 * own writes, and a read after a write throws ReadAfterWriteError (the
 * tracker), exactly as on Firestore and memory.
 */
export class PgTx {
  private readonly ops: Op[] = [];
  /** The rows written, for the outbox: `entity/id` → op. */
  readonly written = new Map<string, { entity: string; id: string; op: 'upsert' | 'delete' }>();
  readonly docs: PgDocs;

  readonly db: Queryable;

  constructor(
    client: Queryable,
    readonly tracker: TxTracker,
  ) {
    this.db = serialized(client);
    this.docs = new PgDocs(this.db);
  }

  get<T extends Doc = Doc>(table: string, id: string): Promise<T | null> {
    this.tracker.read();
    return this.docs.get<T>(table, id);
  }

  rows<T extends Doc = Doc>(entity: string, filter?: Filter): Promise<StoredDoc<T>[]> {
    this.tracker.read();
    return this.docs.rows<T>(entity, filter);
  }

  /** A read of the transaction's own in SQL (a count, a keyset page). */
  async query<R extends Doc = Doc>(text: string, params?: unknown[]): Promise<R[]> {
    this.tracker.read();
    return (await this.db.query<R>(text, params)).rows;
  }

  private note(table: string, id: string, op: 'upsert' | 'delete') {
    const r = resolveEntity(table, id);
    this.written.set(`${r.entity}/${r.id}`, { entity: r.entity, id: r.id, op });
  }

  put(table: string, id: string, row: Doc): void {
    this.tracker.write();
    const copy = structuredClone(row);
    this.note(table, id, 'upsert');
    this.ops.push((d) => d.put(table, id, copy));
  }

  merge(table: string, id: string, fields: Doc): void {
    this.tracker.write();
    const copy = structuredClone(fields);
    this.note(table, id, 'upsert');
    this.ops.push((d) => d.merge(table, id, copy));
  }

  delete(table: string, id: string): void {
    this.tracker.write();
    this.note(table, id, 'delete');
    this.ops.push((d) => d.delete(table, id));
  }

  /** A write in SQL (an increment: `set n = n + 1`), run in order with the others; names the row it changes for the outbox. */
  exec(row: { table: string; id: string }, text: string, params: unknown[]): void {
    this.tracker.write();
    this.note(row.table, row.id, 'upsert');
    this.ops.push(async (d) => void (await d.db.query(text, params)));
  }

  /**
   * A write that needs the row as committed before this transaction (a map
   * merged key by key, an array union — what Firestore's merge and
   * arrayUnion do server side): run in order with the others, inside the
   * same serializable transaction. Names the row for the outbox.
   */
  apply(row: { table: string; id: string }, fn: (docs: PgDocs) => Promise<void>): void {
    this.tracker.write();
    this.note(row.table, row.id, 'upsert');
    this.ops.push(fn);
  }

  /** Run what was written (the UoW calls it once `fn` resolved). */
  async flush(): Promise<void> {
    for (const op of this.ops) await op(this.docs);
  }
}

/**
 * One client runs one query at a time: a repository's reads side by side
 * (`Promise.all`) are queued here instead of on pg's own deprecated queue.
 */
function serialized(client: Queryable): Queryable {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    query(text, params) {
      const next = tail.then(() => client.query(text, params));
      tail = next.catch(() => {});
      return next;
    },
  } as Queryable;
}

/** PostgreSQL's serialization failure and deadlock: the transaction is run again. */
const RETRYABLE = new Set(['40001', '40P01']);

export function retryable(e: unknown): boolean {
  return !!e && typeof e === 'object' && RETRYABLE.has(String((e as { code?: unknown }).code));
}

export interface PgUowOptions {
  /** Attempts in all (the first and its retries). */
  attempts?: number;
  /** The first retry's wait, doubled each time, with jitter (ms). */
  backoffMs?: number;
  /** Record a `change_log` row for every row written, in the same transaction (Phase 4: PostgreSQL as the primary). */
  outbox?: boolean;
  now?: () => number;
}

/**
 * Transactions as `begin isolation level serializable`: a serialization
 * failure (40001) or a deadlock (40P01) runs `fn` again — as Firestore's SDK
 * retries on contention — with a doubling, jittered wait, up to `attempts`.
 * `fn` may therefore run more than once (ports/uow.ts). A nested `run`
 * throws. `build` makes a transaction's repositories (TxRepos, or a
 * contract's probe).
 */
export class PostgresUnitOfWork<R> implements UnitOfWork<R> {
  private readonly inside = new AsyncLocalStorage<true>();

  constructor(
    private readonly pool: PgPool,
    private readonly build: (tx: PgTx) => R,
    private readonly opts: PgUowOptions = {},
  ) {}

  async run<T>(fn: (tx: R) => Promise<T>, opts: UowOptions = {}): Promise<T> {
    if (this.inside.getStore()) throw new Error(`uow.run nested inside another transaction${opts.label ? ` (${opts.label})` : ''}`);
    const attempts = this.opts.attempts ?? 12;
    const backoff = this.opts.backoffMs ?? 5;
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      let broken = false;
      try {
        await client.query('begin isolation level serializable');
        const value = await this.inside.run(true, async () => {
          const tx = new PgTx(client, new TxTracker(opts.label));
          const answer = await fn(this.build(tx));
          await tx.flush();
          if (this.opts.outbox) await recordChanges(tx, this.opts.now ?? Date.now);
          return answer;
        });
        await client.query('commit');
        return value;
      } catch (e) {
        await client.query('rollback').catch(() => {
          broken = true;
        });
        if (retryable(e) && attempt < attempts) {
          const wait = backoff * 2 ** (attempt - 1);
          await new Promise((r) => setTimeout(r, wait / 2 + Math.random() * wait));
          continue;
        }
        throw e;
      } finally {
        client.release(broken);
      }
    }
  }
}

/** The transaction's change_log rows (its outbox), written last, in the same transaction. */
async function recordChanges(tx: PgTx, now: () => number): Promise<void> {
  const at = now();
  for (const w of tx.written.values()) {
    if (w.entity === 'changeLog') continue;
    const id = ulid(at);
    await tx.docs.put('changeLog', id, { ...changeEntry(w.entity, w.id, w.op, at) });
  }
}

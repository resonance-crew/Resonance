import type { ServerCtx } from '@/server/ctx';
import type { TxRepos, UnitOfWork } from '@/server/ports/uow';
import { PgDocs } from './docs';
import { pgLeaseStore, pgRateLimiter, pgRealtime, pgVectors } from './platform';
import { buildPgDataRepos, buildPgTxRepos } from './repos';
import { PostgresUnitOfWork, type PgPool, type PgUowOptions } from './uow';

/** The production UnitOfWork over PostgreSQL (TxRepos; aggregates without a repository throw NotWiredError). */
export function pgUow(pool: PgPool, opts?: PgUowOptions): UnitOfWork<TxRepos> {
  return new PostgresUnitOfWork<TxRepos>(pool, buildPgTxRepos, opts);
}

/**
 * `base` with its data ports on PostgreSQL: transactions, repositories,
 * rate windows, leases, signals and vectors. Everything else (push, the
 * buckets, the clock, the logger, `later`) stays `base`'s. The shadow reads
 * build theirs this way; Phase 4 would make it the primary.
 */
export function withPostgres<C extends ServerCtx>(base: C, pool: PgPool, opts?: PgUowOptions): C {
  return {
    ...base,
    uow: pgUow(pool, opts),
    data: buildPgDataRepos(new PgDocs(pool)),
    limits: pgRateLimiter(pool),
    leases: pgLeaseStore(pool),
    realtime: pgRealtime(pool, base.log),
    vectors: pgVectors(pool),
  };
}

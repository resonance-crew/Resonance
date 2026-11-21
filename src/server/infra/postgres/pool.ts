import type { PgPool } from './uow';

/**
 * A pg Pool, made on first use: `pg` is loaded only here, with `await
 * import()`, so nothing in the default build or serverCtx() touches
 * PostgreSQL unless the environment asks for it (`POSTGRES_URL`, the shadow
 * reads' `READ_BACKEND=shadow`; PRIMARY_BACKEND stays firestore).
 */
export interface PgPoolOptions {
  url: string;
  /** Prepended to the connection's search_path (a test's own schema). */
  schema?: string;
  max?: number;
}

export type ClosablePool = PgPool & { end(): Promise<void> };

export async function createPgPool(opts: PgPoolOptions): Promise<ClosablePool> {
  const { Pool, types } = (await import('pg')).default;
  // int8 (count(*), bigint columns) as text: the codec makes numbers of them.
  types.setTypeParser(20, (v: string) => v);
  const pool = new Pool({
    connectionString: opts.url,
    max: opts.max ?? 10,
    ...(opts.schema ? { options: `-c search_path=${opts.schema},public` } : {}),
  });
  pool.on('error', () => {
    // An idle client dropped by the server: the pool replaces it; the next query reports any real failure.
  });
  return pool as unknown as ClosablePool;
}

let shared: Promise<ClosablePool> | null = null;

/** The instance's pool on `POSTGRES_URL`; throws when it isn't set. */
export function envPgPool(env: NodeJS.ProcessEnv = process.env): Promise<ClosablePool> {
  const url = env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL is not set: PostgreSQL is optional and off');
  shared ??= createPgPool({ url, max: Number(env.POSTGRES_POOL_MAX) || 5 });
  return shared;
}

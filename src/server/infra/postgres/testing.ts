import { migrate } from './migrate';
import { createPgPool, type ClosablePool } from './pool';
import { PgDocs } from './docs';

/**
 * The PostgreSQL the Postgres suites run on: `PG_TEST_URL` (a throwaway
 * database with pgvector — docs/ops/postgres.md). Unset, the suites skip:
 * CI without a PostgreSQL stays green, and its `postgres` job sets it.
 */
export const PG_TEST_URL = process.env.PG_TEST_URL ?? '';

export const PG_SKIP_REASON = 'PG_TEST_URL is not set: the PostgreSQL suites skip (docs/ops/postgres.md)';

export interface PgTestDb {
  pool: ClosablePool;
  docs: PgDocs;
  schema: string;
  /** Empty every table (the migrations stay applied): a test's fresh database. */
  reset(): Promise<void>;
  /** Drop the schema and close the pool. */
  close(): Promise<void>;
}

/**
 * A schema of this suite's own on PG_TEST_URL, migrated: suites running side
 * by side never see each other's rows, and nothing is left behind.
 */
export async function pgTestDb(): Promise<PgTestDb> {
  if (!PG_TEST_URL) throw new Error(PG_SKIP_REASON);
  const schema = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = await createPgPool({ url: PG_TEST_URL, max: 1 });
  try {
    // The extension is the database's: made once in public (suites start side by side, so one may lose the race).
    for (let i = 0; i < 5; i++) {
      try {
        await admin.query('create extension if not exists vector schema public');
        break;
      } catch (e) {
        if (i === 4) throw e;
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
    await admin.query(`create schema ${schema}`);
  } finally {
    await admin.end();
  }
  const pool = await createPgPool({ url: PG_TEST_URL, schema, max: 10 });
  await migrate(pool);
  return {
    pool,
    docs: new PgDocs(pool),
    schema,
    async reset() {
      const { rows } = await pool.query<{ t: string }>(
        `select tablename as t from pg_tables where schemaname = $1 and tablename <> 'schema_migrations'`,
        [schema],
      );
      if (rows.length) await pool.query(`truncate ${rows.map((r) => `"${r.t}"`).join(', ')}`);
    },
    async close() {
      await pool.query(`drop schema ${schema} cascade`);
      await pool.end();
    },
  };
}

/** A suite's database, made on first use and shared by its tests (`make()` awaits it). */
export function lazyPgTestDb(): { get(): Promise<PgTestDb>; close(): Promise<void> } {
  let db: Promise<PgTestDb> | null = null;
  return {
    get: () => (db ??= pgTestDb()),
    async close() {
      if (db) await (await db).close();
    },
  };
}

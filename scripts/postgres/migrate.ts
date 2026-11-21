/**
 * Apply the PostgreSQL migrations (src/server/infra/postgres/migrations/*.sql)
 * not yet applied to the database at POSTGRES_URL (or the first argument),
 * in order, each recorded in `schema_migrations`. For a local or staging
 * database only — production stays on Firestore (docs/ops/postgres.md).
 *
 *   POSTGRES_URL=postgres://postgres:pg@localhost:55432/resonance npx tsx scripts/postgres/migrate.ts
 */
import { migrate } from '../../src/server/infra/postgres/migrate';
import { createPgPool } from '../../src/server/infra/postgres/pool';

async function main() {
  const url = process.argv[2] ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('Give the database: POSTGRES_URL=… or the first argument');
  const pool = await createPgPool({ url, max: 1 });
  try {
    const applied = await migrate(pool);
    console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Nothing to apply: every migration is in schema_migrations');
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

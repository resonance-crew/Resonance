import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Queryable } from './docs';

/** Where the plain SQL migrations live: `NNNN_name.sql`, applied in name order. */
export const MIGRATIONS_DIR = join(process.cwd(), 'src', 'server', 'infra', 'postgres', 'migrations');

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

/** A client of its own for the whole run (the pool's `connect()`), or the pool. */
type Connectable = Queryable & { connect?: () => Promise<Queryable & { release(): void }> };

/**
 * Apply the migrations not yet applied, in order, each in its own
 * transaction, recorded in `schema_migrations` (name, checksum, when). A
 * migration already applied whose file changed is refused: a new file says
 * what changed. Runs under an advisory lock, so two runners never race.
 * Answers the names applied this time.
 */
export async function migrate(db: Connectable, migrations = readMigrations()): Promise<string[]> {
  const client = db.connect ? await db.connect() : null;
  const q: Queryable = client ?? db;
  try {
    await q.query(`select pg_advisory_lock(hashtext('resonance.schema_migrations'))`);
    await q.query(
      `create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`,
    );
    const { rows } = await q.query<{ name: string; checksum: string }>('select name, checksum from schema_migrations');
    const done = new Map(rows.map((r) => [r.name, r.checksum]));
    const applied: string[] = [];
    for (const m of migrations) {
      const was = done.get(m.name);
      if (was !== undefined) {
        if (was !== m.checksum) throw new Error(`Migration ${m.name} changed after it was applied: add a new one instead`);
        continue;
      }
      await q.query('begin');
      try {
        await q.query(m.sql);
        await q.query('insert into schema_migrations (name, checksum) values ($1, $2)', [m.name, m.checksum]);
        await q.query('commit');
      } catch (e) {
        await q.query('rollback');
        throw Object.assign(new Error(`Migration ${m.name} failed: ${(e as Error).message}`), { cause: e });
      }
      applied.push(m.name);
    }
    return applied;
  } finally {
    await q.query(`select pg_advisory_unlock(hashtext('resonance.schema_migrations'))`).catch(() => {});
    client?.release();
  }
}

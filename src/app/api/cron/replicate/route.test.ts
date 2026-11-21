import { afterEach, describe, expect, it, vi } from 'vitest';

// The replicator's cron stub: refused without the cron secret, and with it a
// no-op until the outbox, the target and its database are all switched on —
// none of which production sets. PostgreSQL is never loaded on the way.

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('pg', () => {
  throw new Error('pg must not be loaded while replication is off');
});

const { GET } = await import('./route');

const call = (secret?: string) =>
  GET(new Request('https://resonance.test/api/cron/replicate', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/replicate', () => {
  it('refuses a caller without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call()).status).toBe(401);
    expect((await call('nope')).status).toBe(401);
  });

  it('does nothing while the outbox is off, or no target is set', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.stubEnv('OUTBOX_ENABLED', '');
    expect(await (await call('s3cret')).json()).toEqual({ replicated: false, off: 'OUTBOX_ENABLED is not 1' });
    vi.stubEnv('OUTBOX_ENABLED', '1');
    vi.stubEnv('REPLICA_TARGET', '');
    expect(await (await call('s3cret')).json()).toEqual({ replicated: false, off: 'REPLICA_TARGET is not postgres' });
    vi.stubEnv('REPLICA_TARGET', 'postgres');
    vi.stubEnv('POSTGRES_URL', '');
    expect(await (await call('s3cret')).json()).toEqual({ replicated: false, off: 'POSTGRES_URL is not set' });
  });
});

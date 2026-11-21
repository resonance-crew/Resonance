import { afterAll, describe, expect, it } from 'vitest';
import { describeLeaseStoreContract } from '@/server/contract/lease.contract';
import type { ProbeTx } from '@/server/contract/probe';
import { describeRateLimiterContract } from '@/server/contract/rateLimit.contract';
import { describeRealtimeContract } from '@/server/contract/realtime.contract';
import { describeUnitOfWorkContract } from '@/server/contract/uow.contract';
import { memoryVectors } from '@/server/infra/memory/vectors';
import { ReadAfterWriteError } from '@/server/ports/uow';
import type { VectorRecord } from '@/server/ports/vectors';
import { migrate } from './migrate';
import { pgLeaseStore, pgProbe, pgRateLimiter, pgRealtime, pgVectors } from './platform';
import { lazyPgTestDb, PG_SKIP_REASON, PG_TEST_URL } from './testing';
import { PostgresUnitOfWork } from './uow';

// The UnitOfWork, RateLimiter, LeaseStore, RealtimePublisher and VectorStore
// over PostgreSQL against the contracts memory and the emulator keep, then
// what only PostgreSQL has to show: retries on serialization failures, the
// migration runner, pgvector against the exact search. Skipped without PG_TEST_URL.

const pg = lazyPgTestDb();
afterAll(() => pg.close());
let run = 0;

describe.skipIf(!PG_TEST_URL)(`PostgreSQL platform ports${PG_TEST_URL ? '' : ` — ${PG_SKIP_REASON}`}`, () => {
  describeUnitOfWorkContract('postgres', async () => {
    const db = await pg.get();
    const p = `u${++run}_`;
    const uow = new PostgresUnitOfWork<ProbeTx>(db.pool, (tx) => {
      const probe = pgProbe(tx);
      return { get: (k) => probe.get(p + k), set: (k, n) => probe.set(p + k, n), delete: (k) => probe.delete(p + k) };
    });
    return { uow, peek: async (key) => ((await db.docs.get('probe', p + key))?.n as number | undefined) ?? null };
  });

  describeRateLimiterContract('postgres', async () => {
    const db = await pg.get();
    return {
      limiter: pgRateLimiter(db.pool),
      used: async (uid, bucket) => (await db.docs.get('rateLimits', `${uid}_${bucket}`))?.used as number | undefined,
    };
  });

  describeLeaseStoreContract('postgres', async () => {
    const db = await pg.get();
    run++;
    return { leases: pgLeaseStore(db.pool), key: `recommendations/l${run}`, other: `recommendations/m${run}` };
  });

  describeRealtimeContract('postgres', async () => {
    const db = await pg.get();
    const publisher = pgRealtime(db.pool);
    const p = `s${++run}_`;
    return { publisher, read: (uid) => publisher.read(uid), id: (n) => p + n };
  });

  describe('the PostgreSQL UnitOfWork', () => {
    it('runs fn again on a serialization failure (40001), and keeps only the attempt that committed', async () => {
      const db = await pg.get();
      const k = `retry${++run}`;
      let attempts = 0;
      const uow = new PostgresUnitOfWork(db.pool, pgProbe, { backoffMs: 1 });
      const n = await uow.run(async (tx) => {
        attempts++;
        const was = (await tx.get(k)) ?? 0;
        if (attempts === 1) throw Object.assign(new Error('could not serialize access'), { code: '40001' });
        tx.set(k, was + 1);
        return was + 1;
      });
      expect([n, attempts]).toEqual([1, 2]);
      expect((await db.docs.get('probe', k))?.n).toBe(1);
    });

    it('gives up after its attempts, with the database error', async () => {
      const db = await pg.get();
      const uow = new PostgresUnitOfWork(db.pool, pgProbe, { attempts: 3, backoffMs: 1 });
      let attempts = 0;
      await expect(
        uow.run(async () => {
          attempts++;
          throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        }),
      ).rejects.toMatchObject({ code: '40P01' });
      expect(attempts).toBe(3);
    });

    it('refuses a read after a write, and a nested run', async () => {
      const db = await pg.get();
      const uow = new PostgresUnitOfWork(db.pool, pgProbe);
      await expect(uow.run(async (tx) => (tx.set('raw', 1), tx.get('raw')))).rejects.toBeInstanceOf(ReadAfterWriteError);
      await expect(uow.run(async () => uow.run(async () => 1))).rejects.toThrow(/nested/);
    });

    it('records the outbox in the same transaction when asked (Phase 4 primary)', async () => {
      const db = await pg.get();
      await db.reset();
      const uow = new PostgresUnitOfWork(db.pool, pgProbe, { outbox: true });
      await uow.run(async (tx) => (tx.set('a', 1), tx.set('b', 2), tx.delete('c')));
      await expect(uow.run(async (tx) => (tx.set('d', 1), Promise.reject(new Error('no'))))).rejects.toThrow('no');
      const log = await db.docs.rows('changeLog');
      expect(log.map((r) => [r.row.entity, r.row.id, r.row.op])).toEqual([
        ['probe', 'a', 'upsert'],
        ['probe', 'b', 'upsert'],
        ['probe', 'c', 'delete'],
      ]);
    });
  });

  describe('the migration runner', () => {
    it('applies each file once, records it, and refuses one changed after it was applied', async () => {
      const db = await pg.get();
      const { rows } = await db.pool.query<{ name: string }>('select name from schema_migrations order by name');
      expect(rows.map((r) => r.name)).toContain('0001_init.sql');
      expect(await migrate(db.pool)).toEqual([]);
      const extra = { name: '9999_probe.sql', sql: 'create table probe_extra (k text primary key);', checksum: 'x' };
      expect(await migrate(db.pool, [extra])).toEqual(['9999_probe.sql']);
      await expect(migrate(db.pool, [{ ...extra, checksum: 'y' }])).rejects.toThrow(/changed after it was applied/);
    });

    it('sweeps the TTL rows past their time, and only those', async () => {
      const db = await pg.get();
      await db.reset();
      await db.docs.put('readerSignals', 'u1_c1', { userId: 'u1', cardId: 'c1', expireAt: new Date('2026-01-01T00:00:00Z') });
      await db.docs.put('readerSignals', 'u1_c2', { userId: 'u1', cardId: 'c2', expireAt: new Date('2027-01-01T00:00:00Z') });
      const { rows } = await db.pool.query<{ n: string }>(`select resonance_ttl_sweep('2026-06-01T00:00:00Z') as n`);
      expect(Number(rows[0].n)).toBe(1);
      expect((await db.docs.rows('readerSignals')).map((r) => r.id)).toEqual(['u1_c2']);
    });
  });

  describe('pgvector', () => {
    const DIM = 1536;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const unit = () => {
      const v = Array.from({ length: DIM }, rand);
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    };
    const record = (i: number, over: Partial<VectorRecord> = {}): VectorRecord => ({
      cardId: `card${String(i).padStart(2, '0')}`,
      authorId: `author${i % 3}`,
      visibility: i % 5 === 0 ? 'private' : 'public',
      channel: i % 2 ? 'insight' : 'situation',
      part: 0,
      vector: unit(),
      embedModel: 'text-embedding-3-small',
      insightScore: i / 10,
      coreInsight: `insight ${i}`,
      situation: `situation ${i}`,
      lifeDomain: 'work',
      span: 'a few words',
      ...over,
    });

    it('answers the nearest as the exact cosine search does, its pre-filters and the author left out', async () => {
      const db = await pg.get();
      await db.reset();
      const records = Array.from({ length: 40 }, (_, i) => record(i));
      const store = pgVectors(db.pool);
      const exact = memoryVectors();
      await store.upsert(records);
      await exact.upsert(records);
      for (let i = 0; i < 4; i++) {
        const query = { channel: (i % 2 ? 'insight' : 'situation') as VectorRecord['channel'], vector: unit(), filter: { visibility: 'public' as const, excludeAuthorId: 'author1' }, limit: 6 };
        const [got, want] = await Promise.all([store.nearest(query), exact.nearest(query)]);
        expect(got.map((h) => h.record.cardId)).toEqual(want.map((h) => h.record.cardId));
        got.forEach((h, j) => expect(h.distance).toBeCloseTo(want[j].distance, 5));
        expect(got[0]?.record).toEqual(want[0]?.record);
      }
    });

    it('replaces a card’s parts, moves their visibility and deletes them with the card', async () => {
      const db = await pg.get();
      await db.reset();
      const store = pgVectors(db.pool);
      await store.upsert([record(1, { part: 0 }), record(1, { part: 1 })]);
      await store.upsert([record(1, { part: 0 })]);
      expect((await store.listByCards(['card01'])).map((r) => r.part)).toEqual([0]);
      await store.setVisibility('card01', 'private');
      expect(await store.listByVisibility('public')).toEqual([]);
      expect((await store.listByVisibility('private', 'insight')).map((r) => r.cardId)).toEqual(['card01']);
      await store.deleteByCard('card01');
      expect(await store.listByCards(['card01'])).toEqual([]);
    });
  });
});

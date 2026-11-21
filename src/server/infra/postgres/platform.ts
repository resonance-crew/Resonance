import { chargeWindows, rateWindowId } from '@/server/domain/rateLimit';
import type { LeaseStore } from '@/server/ports/lease';
import type { RateLimiter } from '@/server/ports/rateLimit';
import { SIGNALS_VERSION, type RealtimePublisher, type SignalsDoc } from '@/server/ports/realtime';
import type { Logger } from '@/server/ports/log';
import type { VectorStore, VectorRecord, NearestHit } from '@/server/ports/vectors';
import { rateLimiterOver } from '../rateLimit';
import type { Doc } from './codec';
import type { PgTx, PgPool } from './uow';
import { PostgresUnitOfWork } from './uow';

/**
 * The platform ports over PostgreSQL: rate windows (`rate_limits`, one
 * serializable transaction a request, as Firestore's), leases (`leases`, one
 * row a key), the signal channel (`signals`, counters raised in one
 * statement) and the card vectors (pgvector).
 */

/** The probe of the UnitOfWork contract (src/server/contract/probe.ts) inside a PostgreSQL transaction. */
export function pgProbe(tx: PgTx) {
  const n = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    get: async (key: string) => n((await tx.get('probe', key))?.n),
    set: (key: string, value: number) => tx.put('probe', key, { n: value }),
    delete: (key: string) => tx.delete('probe', key),
  };
}

export function pgRateLimiter(pool: PgPool): RateLimiter {
  const uow = new PostgresUnitOfWork(pool, (tx) => tx);
  return rateLimiterOver((uid, spends, now) =>
    uow.run(
      async (tx) => {
        const ids = spends.map(([bucket]) => rateWindowId(uid, bucket));
        const stored = await Promise.all(ids.map((id) => tx.get('rateLimits', id)));
        const { allowed, writes } = chargeWindows(uid, spends, stored, now);
        for (const { index, window } of writes) tx.put('rateLimits', ids[index], { ...window });
        return allowed;
      },
      { label: 'rateLimit' },
    ),
  );
}

/** Leases: `insert … on conflict do update … where lease_until <= now` — taken only when free, in one statement. */
export function pgLeaseStore(pool: PgPool): LeaseStore {
  return {
    async acquire(key, ttlMs, now) {
      const r = await pool.query(
        `insert into leases (key, lease_until) values ($1, $2) on conflict (key) do update set lease_until = excluded.lease_until where leases.lease_until <= $3 returning key`,
        [key, new Date(now + ttlMs), new Date(now)],
      );
      return (r.rowCount ?? 0) === 1;
    },
    async release(key) {
      await pool.query('delete from leases where key = $1', [key]);
    },
  };
}

const TOPICS = ['inbox', 'bell', 'graph', 'map', 'drafts'] as const;

/** `signals/{uid}`'s counters, each touch one upsert that adds to them (no read, so none is lost). */
export function pgRealtime(pool: PgPool, log?: Logger): RealtimePublisher & { read(uid: string): Promise<SignalsDoc | null> } {
  return {
    async touch(uid, topics) {
      const add: Record<string, number> = {};
      const threads: Record<string, number> = {};
      for (const t of topics) {
        if (typeof t === 'string') add[t] = (add[t] ?? 0) + 1;
        else threads[t.thread] = (threads[t.thread] ?? 0) + 1;
      }
      const params: unknown[] = [uid, SIGNALS_VERSION, JSON.stringify(threads), ...TOPICS.map((t) => add[t] ?? 0)];
      const sum = TOPICS.map((t, i) => `"${t}" = coalesce(signals."${t}", 0) + $${i + 4}`).join(', ');
      try {
        await pool.query(
          `insert into signals (user_id, v, threads, at, ${TOPICS.map((t) => `"${t}"`).join(', ')})
           values ($1, $2, $3::jsonb, now(), ${TOPICS.map((_, i) => `$${i + 4}`).join(', ')})
           on conflict (user_id) do update set v = $2, at = now(), ${sum},
             threads = coalesce(signals.threads, '{}'::jsonb) || (
               select coalesce(jsonb_object_agg(k, coalesce((signals.threads ->> k)::bigint, 0) + v::bigint), '{}'::jsonb)
               from jsonb_each_text($3::jsonb) as t(k, v))`,
          params,
        );
      } catch (e) {
        log?.warn('[realtime] signals', uid, e);
      }
    },
    async read(uid) {
      const { rows } = await pool.query<Doc>('select * from signals where user_id = $1', [uid]);
      const r = rows[0];
      if (!r) return null;
      const num = (v: unknown) => Number(v ?? 0);
      const threads = Object.fromEntries(Object.entries((r.threads ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]));
      return { v: num(r.v), inbox: num(r.inbox), bell: num(r.bell), graph: num(r.graph), map: num(r.map), drafts: num(r.drafts), threads };
    },
  };
}

const vectorLiteral = (v: number[]) => `[${v.join(',')}]`;

function recordOf(r: Doc, withVector: boolean): VectorRecord {
  const extra = (r.extra ?? {}) as Doc;
  return {
    cardId: String(r.card_id),
    authorId: String(r.author_id ?? ''),
    visibility: r.visibility as VectorRecord['visibility'],
    channel: r.channel as VectorRecord['channel'],
    part: Number(r.part),
    vector: withVector && typeof r.vector === 'string' ? (JSON.parse(r.vector) as number[]) : [],
    embedModel: String(r.embed_model ?? ''),
    insightScore: Number(extra.insightScore ?? 0),
    coreInsight: String(extra.coreInsight ?? ''),
    situation: String(extra.situation ?? ''),
    lifeDomain: String(extra.lifeDomain ?? ''),
    span: String(extra.span ?? ''),
  };
}

/**
 * The card vectors on pgvector: `vector(1536)` under an HNSW index
 * (`vector_cosine_ops`); `nearest` filters by visibility and channel in the
 * WHERE (pgvector 0.8's iterative scan keeps a filtered search from coming
 * back short), orders by cosine distance (`<=>`, 1 − cos θ, as Firestore's
 * COSINE), and leaves the viewer's own cards out after the limit — as the
 * Firestore and memory stores do.
 */
export function pgVectors(pool: PgPool): VectorStore {
  const write = async (db: { query: PgPool['query'] }, list: VectorRecord[]) => {
    for (const r of list) {
      const extra = { insightScore: r.insightScore, coreInsight: r.coreInsight, situation: r.situation, lifeDomain: r.lifeDomain, span: r.span };
      await db.query(
        `insert into card_vectors (card_id, channel, part, author_id, visibility, vector, embed_model, extra)
         values ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb)
         on conflict (card_id, channel, part) do update set author_id = excluded.author_id, visibility = excluded.visibility,
           vector = excluded.vector, embed_model = excluded.embed_model, extra = excluded.extra`,
        [r.cardId, r.channel, r.part, r.authorId, r.visibility, r.vector.length ? vectorLiteral(r.vector) : null, r.embedModel, JSON.stringify(extra)],
      );
    }
  };
  return {
    async upsert(list) {
      if (!list.length) return;
      const client = await pool.connect();
      try {
        await client.query('begin');
        // A reading written again replaces its parts: the parts it no longer has go.
        for (const cardId of new Set(list.map((r) => r.cardId))) {
          const keep = list.filter((r) => r.cardId === cardId).map((r) => `${r.channel}__${r.part}`);
          await client.query(`delete from card_vectors where card_id = $1 and not (channel || '__' || part::text = any($2::text[]))`, [cardId, keep]);
        }
        await write(client, list);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async deleteByCard(cardId) {
      await pool.query('delete from card_vectors where card_id = $1', [cardId]);
    },
    async setVisibility(cardId, visibility) {
      await pool.query('update card_vectors set visibility = $2 where card_id = $1', [cardId, visibility]);
    },
    async listByVisibility(visibility, channel) {
      const { rows } = await pool.query<Doc>(
        `select * from card_vectors where visibility = $1 and ($2::text is null or channel = $2) and vector is not null order by card_id, channel, part`,
        [visibility, channel ?? null],
      );
      return rows.map((r) => recordOf(r, true));
    },
    async listByCards(cardIds) {
      if (!cardIds.length) return [];
      const { rows } = await pool.query<Doc>(`select * from card_vectors where card_id = any($1::text[]) and vector is not null order by card_id, channel, part`, [cardIds]);
      return rows.map((r) => recordOf(r, true));
    },
    async nearest(query): Promise<NearestHit[]> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`set local hnsw.iterative_scan = 'relaxed_order'`).catch(() => {});
        const { rows } = await client.query<Doc>(
          `select card_id, channel, part, author_id, visibility, embed_model, extra, vector <=> $1::vector as distance
           from card_vectors where visibility = $2 and channel = $3 and vector is not null
           order by vector <=> $1::vector, card_id, channel, part limit $4`,
          [vectorLiteral(query.vector), query.filter.visibility, query.channel, Math.max(0, Math.floor(query.limit))],
        );
        await client.query('commit');
        return rows
          .map((r) => ({ record: recordOf(r, false), distance: Number(r.distance) }))
          .sort((a, b) => a.distance - b.distance)
          .filter((h) => !query.filter.excludeAuthorId || h.record.authorId !== query.filter.excludeAuthorId);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

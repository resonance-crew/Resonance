import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/api/cronAuth';
import { replicate } from '@/server/app/replicate';
import { serverCtx } from '@/server/ctx';
import { replicationFromEnv } from '@/server/infra/replication';

export const maxDuration = 60;

/** Batches are started until this much of maxDuration is spent; the rest waits for the next run. */
const BUDGET_MS = (maxDuration - 15) * 1000;

/**
 * The outbox's replicator (Phase 3 of the middleware decouple, plan section
 * 4.3): Firestore's `changeLog` into PostgreSQL. A stub on purpose — it is
 * NOT in vercel.json `crons`, and does nothing unless OUTBOX_ENABLED=1,
 * REPLICA_TARGET=postgres and POSTGRES_URL are all set (none is, in
 * production). docs/ops/scheduler.md says how it would be scheduled (every
 * minute) and docs/ops/postgres.md what Phase 4 needs first. Vercel Cron's
 * `Authorization: Bearer $CRON_SECRET`, as every cron route; counts only in
 * the answer.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ends = await replicationFromEnv();
  if ('off' in ends) return NextResponse.json({ replicated: false, off: ends.off });
  const ctx = serverCtx();
  const result = await replicate(ends.source, ends.target, { deadline: Date.now() + BUDGET_MS, log: ctx.log });
  return NextResponse.json({ replicated: true, ...result });
}

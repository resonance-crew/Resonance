import { warmPicksIn, warmReaderIn, type WarmReaderOutcome, type WarmRun } from '@/server/app/recommendWarm';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { BuildFeed } from './daily';
import { recommendFeed } from './funnel';
import { getVectorStore } from './vectorStore';

/**
 * The warm-up before the evening's pick push — now
 * src/server/app/recommendWarm.ts. These are its legacy facades (the cron
 * route and the emulator suites call them with a database); the default
 * build is the funnel's facade, as ever.
 */
export { ACTIVE_DAYS, type WarmReaderOutcome, type WarmRun } from '@/server/app/recommendWarm';

const ctxOf = (db: AdminDb) => ctxFor(db, { vectors: getVectorStore() });

export function warmReader(
  db: AdminDb,
  uid: string,
  opts: { now: number; build?: BuildFeed; clock?: () => number; buildDeadline?: number },
): Promise<WarmReaderOutcome> {
  return warmReaderIn(ctxOf(db), uid, { ...opts, build: opts.build ?? recommendFeed });
}

export function warmPicks(
  db: AdminDb,
  opts: { deadline?: number; buildDeadline?: number; clock?: () => number; build?: BuildFeed; concurrency?: number; pageSize?: number } = {},
): Promise<WarmRun> {
  return warmPicksIn(ctxOf(db), { ...opts, build: opts.build ?? recommendFeed });
}

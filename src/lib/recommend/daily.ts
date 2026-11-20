import {
  dailyRecommendationsIn,
  warmRecommendationsIn,
  type DailyDeps,
  type DailyRecommendations,
  type WarmOutcome,
} from '@/server/app/recommendDaily';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { recommendFeed } from './funnel';
import { getVectorStore } from './vectorStore';

/**
 * Serving the recommended feed apart from building it — now
 * src/server/app/recommendDaily.ts. These are its legacy facades, on the
 * database they are handed and the configured vector store; the default
 * build is the funnel's facade (recommendFeed), as ever.
 */
export {
  FAILURE_COOLDOWN_MS,
  INLINE_BUDGET_MS,
  LEASE_MS,
  planServe,
  readStored,
  recommendationDay,
  type BuildFeed,
  type DailyDeps,
  type DailyRecommendations,
  type RecommendationStatus,
  type ServePlan,
  type StoredRecommendations,
  type WarmOutcome,
} from '@/server/app/recommendDaily';

const ctxOf = (db: AdminDb) => ctxFor(db, { vectors: getVectorStore() });

export function dailyRecommendations(db: AdminDb, uid: string, deps: DailyDeps = {}): Promise<DailyRecommendations> {
  return dailyRecommendationsIn(ctxOf(db), uid, { ...deps, build: deps.build ?? recommendFeed });
}

export function warmRecommendations(db: AdminDb, uid: string, deps: Pick<DailyDeps, 'build' | 'now'> & { deadline?: number } = {}): Promise<WarmOutcome> {
  return warmRecommendationsIn(ctxOf(db), uid, { ...deps, build: deps.build ?? recommendFeed });
}

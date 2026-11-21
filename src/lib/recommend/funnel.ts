import { recommendFeedIn, type FunnelOptions as AppFunnelOptions, type FunnelResult } from '@/server/app/recommendFeed';
import type { AdminDb } from '@/server/infra/firestore/db';
import { serverCtx } from '@/server/ctx';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getVectorStore } from './vectorStore';

/**
 * The read-time funnel (round 26 §A2, §A3) — now src/server/app/recommendFeed.ts
 * (`recommendFeedIn(ctx, …)`). This is its legacy facade: the routes, the
 * daily build's default and the emulator suites call it as ever, on the
 * app's admin database (or `opts.db`) and the configured vector store.
 */
export { LLM_FINAL, MIN_LLM_WINDOW_MS, RERANK_TIMEOUT_MS, SELECT_TIMEOUT_MS, type FunnelResult } from '@/server/app/recommendFeed';

export interface FunnelOptions extends AppFunnelOptions {
  /** The database (tests); the app's admin one otherwise. */
  db?: AdminDb;
}

export function recommendFeed(uid: string, opts: FunnelOptions = {}): Promise<FunnelResult> {
  const { db, ...rest } = opts;
  const vectors = getVectorStore();
  return recommendFeedIn(db ? ctxFor(db, { vectors }) : serverCtx({ vectors }), uid, rest);
}

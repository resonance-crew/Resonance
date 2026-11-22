import { pickPassages } from '@/lib/ai/tasks';
import { ChatIncomplete } from '@/lib/ai/openai';
import { modelsOffline } from '@/lib/text/translation';
import * as app from '@/server/app/tapPassages';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { ServerCtx } from '@/server/ctx';

/**
 * Making a card's tap passages (round 27 §P2; lib/cards/tapPassages says
 * what they are): after a publish's response beside indexCard, after an
 * applied edit's beside the summary translations (the same reindex budget),
 * in the daily cron after indexCard for every card it takes, and the
 * backfill — all pinned to hnd1. Reading them is ./tapPassages (no model).
 *
 * Stored on the card, server-only: `tapPassages = { of, items, model, at }`,
 * `of` the story's passagesHash. Fewer than two after the check, or a
 * refusal: `items: []` with `of` — settled, never asked again for this text.
 * A failure (a timeout, a 5xx, no budget) leaves them as they were and marks
 * the card owed (`indexPendingAt`, as lib/recommend/indexOwed markIndexOwed
 * does — written here, since the cron imports this), so the daily cron tries again; after
 * PASSAGES_TRIES_MAX failures for one text (`failed = { of, tries }`) it is
 * left alone until the story changes.
 *
 * The service is src/server/app/tapPassages.ts; this facade keeps the
 * signature the routes, the cron, the backfill and the suites call, and hands
 * it the model.
 */

export type TapPassagesResult = app.TapPassagesResult;

export interface TapPassagesOptions {
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it, owed. */
  mayCall?: () => Promise<boolean>;
  /** The model call (tests; the backfill paces its own). */
  pick?: typeof pickPassages;
  /**
   * Settled before a failure marks the card owed: publishing runs indexCard beside this, and its end clears the mark
   * (indexPendingAt) — a mark written before that would be lost.
   */
  markAfter?: Promise<unknown>;
  /** False: a failure marks nothing (the daily cron, whose own run is the retry). */
  markOwed?: boolean;
}

/** A failure worth trying again (a timeout, a server error, a cut answer) — a refusal is an answer: none. */
const refused = (e: unknown) => e instanceof ChatIncomplete && e.kind === 'refusal';

/**
 * Make (or remove) card `id`'s tap passages as its story is now. Nothing for
 * a card whose `of` already matches; removes them from a card that may not
 * offer any (unpublished, too short or too complex; the trash keeps them); writes
 * the pick only while the card still has the story it was made from (a newer
 * save's run wins: 'moved'). Never touches `updatedAt`.
 */
export function makeTapPassages(db: AdminDb, id: string, opts: TapPassagesOptions = {}): Promise<TapPassagesResult> {
  return makeTapPassagesIn(ctxFor(db), id, opts);
}

/** makeTapPassages on a ServerCtx (the routes' serverCtx(), the cron's), with the model handed in as above. */
export function makeTapPassagesIn(ctx: ServerCtx, id: string, opts: TapPassagesOptions = {}): Promise<TapPassagesResult> {
  return app.makeTapPassagesIn(ctx, id, {
    pick: opts.pick ?? pickPassages,
    refused,
    // Against the emulators no model is asked, unless the caller handed its own.
    offline: !opts.pick && modelsOffline(),
    mayCall: opts.mayCall,
    markAfter: opts.markAfter,
    markOwed: opts.markOwed,
  });
}

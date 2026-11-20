import { translateSummary } from '@/lib/ai/translate';
import { modelsOffline } from '@/lib/text/translation';
import * as app from '@/server/app/summary';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { ServerCtx } from '@/server/ctx';

/**
 * Making a card's translated title and excerpt (./summaryTranslations says
 * what they are): after a publish or an applied edit's response, beside
 * indexCard, from the routes pinned to hnd1 — and the backfill.
 *
 * The service is src/server/app/summary.ts; this facade keeps the signature
 * the routes, the backfill and the suites call, and hands it the model.
 */

export type SummaryTranslationsResult = app.SummaryTranslationsResult;

export interface SummaryTranslationsOptions {
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it. */
  mayCall?: () => Promise<boolean>;
  /** The model call (tests; the backfill paces its own). */
  translate?: typeof translateSummary;
}

/**
 * Make (or remove) card `id`'s translated title and excerpt as it is now —
 * after a publish or an applied edit's response, beside indexCard. Nothing
 * for a card whose `of` already matches; removes them from a card that may
 * not carry any; writes what the model made only while the card still has
 * the title and excerpt it was made from (a newer save's run wins).
 */
export function makeSummaryTranslations(db: AdminDb, id: string, opts: SummaryTranslationsOptions = {}): Promise<SummaryTranslationsResult> {
  return makeSummaryTranslationsIn(ctxFor(db), id, opts);
}

/** makeSummaryTranslations on a ServerCtx (the routes' serverCtx()), with the model handed in as above. */
export function makeSummaryTranslationsIn(ctx: ServerCtx, id: string, opts: SummaryTranslationsOptions = {}): Promise<SummaryTranslationsResult> {
  return app.makeSummaryTranslations(ctx, id, {
    translate: opts.translate ?? translateSummary,
    // Against the emulators no model is asked, unless the caller handed its own.
    offline: !opts.translate && modelsOffline(),
    mayCall: opts.mayCall,
  });
}

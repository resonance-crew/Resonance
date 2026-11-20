import { mirrorModel } from '@/lib/ai/openai';
import { translateStory, type TranslatedStory } from '@/lib/ai/translate';
import { modelsOffline, type TranslationTarget } from '@/lib/text/translation';
import * as app from '@/server/app/translation';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { ServerCtx } from '@/server/ctx';
import { translationHash } from './translationHash';
import type { TranslationResponseBody } from './schemas';

/**
 * POST /api/v1/cards/{key}/translation (round 25 §F5): a story translated by
 * AI into its reader's interface language — the card page's translate line.
 *
 * In this order: the card as the reader may read it (visibleCard), then only
 * a published public one — named or anonymous, never in the trash — else
 * 404 as for a card that isn't there; a story over TRANSLATE_MAX_CHARS is
 * 413; one already in that language (translationTargets) 400. A translation
 * kept for the card's words as they are (`cards/{id}/translations/{to}`,
 * whose `hash` is over title and story) is answered at once — no model call,
 * no budget. Otherwise the reader's `translate` budget (429), then the model
 * (503 when it fails or runs out of time, nothing kept); what it made is
 * kept for the next reader. The answer holds the title and story alone:
 * nothing about the author, an anonymous card's least of all.
 *
 * The kept translations are server-only (the rules let no client read or
 * write them); deleting a card deletes them (deleteCard), and the account
 * purge's tree delete takes them with its cards.
 *
 * The service is src/server/app/translation.ts (the kept translations
 * src/server/infra/firestore/repos/translations.ts); this facade keeps the
 * signature the route and the suites call, and hands it the model.
 */

export interface TranslationDeps {
  translate?: (input: { title: string; story: string }, to: TranslationTarget) => Promise<TranslatedStory>;
}

export { translationHash };

export function translateCard(
  db: AdminDb,
  viewerId: string,
  key: string,
  to: TranslationTarget,
  deps: TranslationDeps = {},
): Promise<TranslationResponseBody> {
  return translateCardIn(ctxFor(db), viewerId, key, to, deps);
}

/** translateCard on a ServerCtx (the route's serverCtx()), with the model handed in as above. */
export function translateCardIn(
  ctx: ServerCtx,
  viewerId: string,
  key: string,
  to: TranslationTarget,
  deps: TranslationDeps = {},
): Promise<TranslationResponseBody> {
  return app.translateCard(ctx, viewerId, key, to, {
    // Against the emulators no model is asked: only the seed's kept translations answer (scripts/seed-emulator.ts).
    translate: deps.translate ?? (modelsOffline() ? null : translateStory),
    model: mirrorModel,
  });
}

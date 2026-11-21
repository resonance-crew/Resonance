import { ApiFailure } from '@/lib/api/v1/http';
import type { TranslationResponseBody } from '@/lib/api/v1/schemas';
import { translationHash } from '@/lib/api/v1/translationHash';
import { TRANSLATE_MAX_CHARS, translationTargets, type TranslationTarget } from '@/lib/text/translation';
import type { ServerCtx } from '@/server/ctx';
import { trashedAtOf } from '@/server/domain/visibility';
import { visibleCard } from './cardsRead';

/**
 * POST /api/v1/cards/{key}/translation as a service: a published public
 * story translated by AI into its reader's interface language, kept for the
 * next reader (src/lib/api/v1/translation.ts tells the order of its checks
 * and keeps the facade the route and the suites call).
 *
 * The model is handed over (`deps.translate`, null when none may be asked):
 * this file never reaches it (src/server/README.md).
 */

export interface TranslateCardDeps {
  /** The model call; null when no model may be asked (the emulators): only a kept translation answers then. */
  translate: ((input: { title: string; story: string }, to: TranslationTarget) => Promise<{ title: string; story: string }>) | null;
  /** The model a kept translation names. */
  model: () => string;
}

const notFound = () => new ApiFailure('not_found', 'No such card.');
const unavailable = () => new ApiFailure('internal', "The story couldn't be translated just now.", undefined, 503);

export async function translateCard(
  ctx: ServerCtx,
  viewerId: string,
  key: string,
  to: TranslationTarget,
  deps: TranslateCardDeps,
): Promise<TranslationResponseBody> {
  const card = await visibleCard(ctx, viewerId, key);
  // Published and public only: a card for connections, a 私人卡 shared in a thread, a draft — none is translated.
  if (!card.publishedAt || card.visibility !== 'public' || trashedAtOf(card) || card.trashedAt != null) throw notFound();
  const title = typeof card.thoughtCore === 'string' ? card.thoughtCore : '';
  const story = typeof card.story === 'string' ? card.story : '';
  if (story.length > TRANSLATE_MAX_CHARS) {
    throw new ApiFailure('invalid_request', 'This story is too long to translate.', undefined, 413);
  }
  if (!translationTargets(title, story).includes(to)) {
    throw new ApiFailure('invalid_request', 'This story is not in another language.');
  }

  const hash = translationHash(title, story);
  const kept = await ctx.data.translations.getKeptTranslation(card.id, to);
  if (kept && kept.hash === hash) return { to, title: kept.title, story: kept.story };

  if (!deps.translate) throw unavailable();
  await ctx.limits.spend(viewerId, 'translate');
  let made: { title: string; story: string };
  try {
    made = await deps.translate({ title, story }, to);
  } catch (e) {
    console.error('[api/v1] translation', card.id, to, e);
    throw unavailable();
  }
  // Kept for the next reader; a failure to keep it never fails this one.
  await ctx.data.translations
    .keepTranslation(card.id, to, { title: made.title, story: made.story, hash, model: deps.model() })
    .catch((e: unknown) => console.error('[api/v1] translation keep', card.id, to, e));
  return { to, title: made.title, story: made.story };
}

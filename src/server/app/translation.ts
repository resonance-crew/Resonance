import { ApiFailure } from '@/lib/api/v1/http';
import type { TranslationResponseBody } from '@/lib/api/v1/schemas';
import { translationHash } from '@/lib/api/v1/translationHash';
import { TRANSLATE_MAX_CHARS, translationTargets, type TranslationTarget } from '@/lib/text/translation';
import type { ServerCtx } from '@/server/ctx';
import { trashedAtOf } from '@/server/domain/visibility';
import { presentTapPassages } from '@/lib/api/v1/tapPassages';
import { keptTranslatedPassages, passagesSig, verifyTranslatedPassages, type TranslatedPassage } from '@/lib/cards/translatedPassages';
import type { TapPassageItem } from '@/lib/cards/tapPassages';
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
  /**
   * Which piece of the translation renders each of the card's passages (round 31): only candidates, verified here
   * (verifyTranslatedPassages). Null when no model may be asked: only a kept placing answers then (the seed's).
   */
  place?: ((input: { story: string; passages: readonly TapPassageItem[] }, to: TranslationTarget) => Promise<unknown[]>) | null;
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
  const offered = presentTapPassages(card);
  const kept = await ctx.data.translations.getKeptTranslation(card.id, to);
  if (kept && kept.hash === hash) {
    const passages = await placedPassages(ctx, card.id, to, kept.story, offered, kept.passages, deps);
    return { to, title: kept.title, story: kept.story, ...(passages.length ? { passages } : {}) };
  }

  if (!deps.translate) throw unavailable();
  await ctx.limits.spend(viewerId, 'translate');
  let made: { title: string; story: string };
  try {
    made = await deps.translate({ title, story }, to);
  } catch (e) {
    console.error('[api/v1] translation', card.id, to, e);
    throw unavailable();
  }
  // Kept for the next reader; a failure to keep it never fails this one. Kept before its passages are placed, so
  // the placing writes beside a translation that is there.
  const keptNow = await ctx.data.translations
    .keepTranslation(card.id, to, { title: made.title, story: made.story, hash, model: deps.model() })
    .then(() => true)
    .catch((e: unknown) => {
      console.error('[api/v1] translation keep', card.id, to, e);
      return false;
    });
  const passages = await placedPassages(ctx, card.id, to, made.story, offered, undefined, deps, keptNow);
  return { to, title: made.title, story: made.story, ...(passages.length ? { passages } : {}) };
}

/**
 * The card's passages as the translation says them (round 31; lib/cards/translatedPassages): a kept placing of
 * these passages, else — when a model may be asked — placed now and kept beside the translation (a placing that
 * found none is kept too, so it is asked once per translation and passages). A failed call is kept nowhere and
 * answers none: the translation never fails for it, and the next reader asks again. No budget: one small call per
 * card, language and passages.
 */
async function placedPassages(
  ctx: ServerCtx,
  cardId: string,
  to: TranslationTarget,
  translated: string,
  offered: readonly TapPassageItem[],
  stored: unknown,
  deps: TranslateCardDeps,
  keep = true,
): Promise<TranslatedPassage[]> {
  if (!offered.length) return [];
  const kept = keptTranslatedPassages(stored, offered);
  if (kept) return kept;
  if (!deps.place) return [];
  let items: TranslatedPassage[];
  try {
    items = verifyTranslatedPassages(translated, offered, await deps.place({ story: translated, passages: offered }, to));
  } catch (e) {
    console.error('[api/v1] translation passages', cardId, to, e);
    return [];
  }
  if (keep) {
    await ctx.data.translations
      .keepTranslationPassages(cardId, to, { of: passagesSig(offered), items })
      .catch((e: unknown) => console.error('[api/v1] translation passages keep', cardId, to, e));
  }
  return items;
}

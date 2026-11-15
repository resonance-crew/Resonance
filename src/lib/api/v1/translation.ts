import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { mirrorModel } from '@/lib/ai/openai';
import { translateStory, type TranslatedStory } from '@/lib/ai/translate';
import { modelsOffline, TRANSLATE_MAX_CHARS, translationTargets, type TranslationTarget } from '@/lib/text/translation';
import { translationHash } from './translationHash';
import { spend } from '@/lib/api/rateLimit';
import { ApiFailure } from './http';
import { trashedAtOf } from './present';
import { visibleCard } from './reads';
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
 */

export interface TranslationDeps {
  translate?: (input: { title: string; story: string }, to: TranslationTarget) => Promise<TranslatedStory>;
}

export { translationHash };

const notFound = () => new ApiFailure('not_found', 'No such card.');

export async function translateCard(
  db: Firestore,
  viewerId: string,
  key: string,
  to: TranslationTarget,
  deps: TranslationDeps = {},
): Promise<TranslationResponseBody> {
  const card = await visibleCard(db, viewerId, key);
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
  const ref = db.doc(`cards/${card.id}/translations/${to}`);
  const kept = await ref.get();
  if (kept.exists && kept.get('hash') === hash && typeof kept.get('title') === 'string' && typeof kept.get('story') === 'string') {
    return { to, title: kept.get('title'), story: kept.get('story') };
  }

  // Against the emulators no model is asked: only the seed's kept translations answer (scripts/seed-emulator.ts).
  const translate = deps.translate ?? (modelsOffline() ? null : translateStory);
  if (!translate) throw new ApiFailure('internal', "The story couldn't be translated just now.", undefined, 503);
  await spend(db, viewerId, 'translate');
  let made: TranslatedStory;
  try {
    made = await translate({ title, story }, to);
  } catch (e) {
    console.error('[api/v1] translation', card.id, to, e);
    throw new ApiFailure('internal', "The story couldn't be translated just now.", undefined, 503);
  }
  // Kept for the next reader; a failure to keep it never fails this one.
  await ref
    .set({ title: made.title, story: made.story, hash, model: mirrorModel(), createdAt: FieldValue.serverTimestamp() })
    .catch((e: unknown) => console.error('[api/v1] translation keep', card.id, to, e));
  return { to, title: made.title, story: made.story };
}

import { blocksOf, placeInBlocks, PASSAGES_MAX, type TapPassageItem } from './tapPassages';

/**
 * A card's tap passages as they read in one of its kept translations (round 31; the owner, 2026-11-23:
 * 「如果我讀翻譯的文章……那我這邊顯示的清單三句應該也要都翻成英文才對……它這個句子還要可以對應回去原本的那個
 * 標在畫面上」).
 *
 * The passages are the author's own sentences (lib/cards/tapPassages); a reader reading the story in translation
 * is offered each one as the translation says it, and the sentences readers picked are marked where the
 * translation says them. A model is asked, after the translation, which piece of the translated story renders each
 * passage — and only **picks**: every answer must be a contiguous piece of one block of the translated story's
 * plain text (`placeInBlocks`, whitespace read as one), no two overlapping, so nothing a model wrote is ever shown.
 * A passage it can't place is offered in no translation; the pick is still kept by the original's id and words
 * (PUT …/tap/passage takes the id), so the author reads it in their own language.
 *
 * Kept beside the translation (`cards/{id}/translations/{to}.passages = { of, items }`), `of` naming the
 * passages they render (`passagesSig`): when the card's passages change, the next reader's request places them again.
 */

/** A passage as a translation says it: the original's id, the translation's words. */
export type TranslatedPassage = TapPassageItem;

/** The longest piece of a translation one passage may be (code points): a sentence or three, never a paragraph. */
export const TRANSLATED_PASSAGE_MAX_CHARS = 480;

/** Which passages a placement renders: their ids, in order (ids are the hashes of their words). */
export function passagesSig(passages: readonly { id: string }[]): string {
  return passages.map((p) => p.id).join(',');
}

const codePoints = (s: string) => [...s].length;

/**
 * The answers that are pieces of `translatedStory`, one per passage of `originals` at most, in the originals'
 * order: an answer names an original's id and a piece of one block of the translated story's plain text
 * (whitespace read as one), from 2 code points to TRANSLATED_PASSAGE_MAX_CHARS, overlapping no other kept one
 * and not the same words as one. Anything else is dropped.
 */
export function verifyTranslatedPassages(
  translatedStory: string,
  originals: readonly TapPassageItem[],
  answers: readonly unknown[],
): TranslatedPassage[] {
  const blocks = blocksOf(translatedStory);
  if (!blocks.length) return [];
  const wanted = new Set(originals.map((o) => o.id));
  const placed = new Map<string, { block: number; start: number; end: number; text: string }>();
  for (const raw of answers) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, text } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string' || !wanted.has(id) || placed.has(id)) continue;
    const place = placeInBlocks(blocks, text);
    if (!place) continue;
    const n = codePoints(place.text);
    if (n < 2 || n > TRANSLATED_PASSAGE_MAX_CHARS) continue;
    const clash = [...placed.values()].some(
      (k) => k.text === place.text || (k.block === place.block && place.start < k.end && k.start < place.end),
    );
    if (clash) continue;
    placed.set(id, place);
  }
  return originals
    .filter((o) => placed.has(o.id))
    .slice(0, PASSAGES_MAX)
    .map((o) => ({ id: o.id, text: placed.get(o.id)!.text }));
}

/** A kept placement, read as stored: `{ of, items }` when it renders `passages` now, else null (place again). */
export function keptTranslatedPassages(stored: unknown, passages: readonly { id: string }[]): TranslatedPassage[] | null {
  if (!stored || typeof stored !== 'object') return null;
  const { of, items } = stored as Record<string, unknown>;
  if (of !== passagesSig(passages) || !Array.isArray(items)) return null;
  const ids = new Set(passages.map((p) => p.id));
  return items
    .filter((i): i is TranslatedPassage => !!i && typeof i.id === 'string' && typeof i.text === 'string' && i.text.length > 0 && ids.has(i.id))
    .map((i) => ({ id: i.id, text: i.text }));
}

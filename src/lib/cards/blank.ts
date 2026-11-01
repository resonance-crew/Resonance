import { plainText } from '@/lib/markdown/plainText';
import { measure, readableProse } from '@/lib/text/script';

/**
 * A blank card: no title, or a story with no words a reader would read —
 * empty, or only spaces, Markdown syntax, pictures or bare addresses
 * (plainText reads none of them). Its page still opens by its link, and its
 * author still finds it on their profile and in their card box, but nothing
 * that picks cards for readers shows one — the latest feed, recommendations,
 * related cards, the landing page, the pushes, the sitemap — nor is it
 * indexed: a wall of empty cards reads as a broken one.
 *
 * Lists judge it by what they already hold — a FeedCard's title and excerpt
 * (the stored summary, the excerpt of plainText) — so the rule costs them no
 * read.
 */
export function wordless(title: unknown, prose: string): boolean {
  return typeof title !== 'string' || !title.trim() || !prose.trim();
}

/** A FeedCard (or anything with its title and excerpt) that is blank. */
export function blankFeedCard(card: { title: string; excerpt: string }): boolean {
  return wordless(card.title, card.excerpt);
}

/** A card read whole, with its story, that is blank. */
export function blankCard(card: { thoughtCore?: unknown; story?: unknown }): boolean {
  return wordless(card.thoughtCore, plainText(typeof card.story === 'string' ? card.story : ''));
}

/**
 * Less than this — CJK characters and other words, title and story together
 * (as the read time counts them) — is too little to put before a stranger:
 * 「測試／測試」 is 4, "test / test test" 3. Kept low on purpose: an English
 * word carries what two Chinese characters do, and one real line — 「雨天／
 * 學會一個人吃飯」 is 9 — must stay listed. Longer filler is the index's to
 * catch (`signature.placeholder`).
 */
export const LISTED_MIN_UNITS = 8;

/**
 * A thin card: published words, but too few for any list that picks cards
 * for readers (the latest feed, recommendations, related cards, the landing
 * page, the pushes, the sitemap). Judged by the server as it saves a story,
 * and stored on the card (`thin`), so no list reads a story to know it. Its
 * page, its author's profile and card box keep it, as for a blank card.
 */
export function thinCard(card: { thoughtCore?: unknown; story?: unknown }): boolean {
  const title = typeof card.thoughtCore === 'string' ? card.thoughtCore : '';
  const story = typeof card.story === 'string' ? card.story : '';
  const m = measure(readableProse(title, story));
  return m.cjk + m.words < LISTED_MIN_UNITS;
}

/**
 * Whether the server marked a card as not for lists — thin (`thin`, at the
 * save), or read by the model as a test or placeholder
 * (`signature.placeholder`, as it indexed the card after the save). Reads
 * only those two stored fields, never the story: a list's field mask carries
 * them (LIST_FIELDS, SUMMARY_FIELDS). Never depends on the reader, so it
 * says nothing about who wrote an anonymous card.
 */
export function unlistedCard(card: { thin?: unknown; signature?: unknown }): boolean {
  if (card.thin === true) return true;
  const sig = card.signature;
  return !!sig && typeof sig === 'object' && (sig as { placeholder?: unknown }).placeholder === true;
}

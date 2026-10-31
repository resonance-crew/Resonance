import { plainText } from '@/lib/markdown/plainText';

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

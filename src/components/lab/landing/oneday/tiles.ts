import type { Card, User } from '@/lib/db/types';
import { cardPalettes } from '@/lib/design/cardColours';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';
import type { Still } from '@/lib/mascots/pals/still';

/**
 * What a story tile shows of a real card, worked out on the server: only what a card surface already shows (the
 * latest-cards read) — no author at all for an anonymous card.
 */
export interface Tile {
  id: string;
  href: string;
  title: string;
  excerpt: string;
  cover?: string;
  /** The byline; none for an anonymous card. */
  author?: { name: string; initials: string; avatar?: string };
  minutes: number;
  family: number;
  script: 'cjk' | 'latin';
  lang?: string;
}

export function tilesOf(cards: Card[], authors: Record<string, User>): Tile[] {
  const families = cardPalettes(cards.map((c) => c.accentHue));
  return cards.map((card, i) => {
    const prose = card.summary ? card.story : plainText(card.story);
    const type = storyType(card.thoughtCore, prose);
    const author = !card.anonymous ? authors[card.authorId] : undefined;
    return {
      id: card.id,
      href: `/card/${card.anonymous ? card.id : card.slug ?? card.id}`,
      title: card.thoughtCore,
      excerpt: excerpt(prose, 120),
      cover: card.media?.url || undefined,
      author: author ? { name: author.handle, initials: author.initials, avatar: author.avatarUrl } : undefined,
      minutes: card.summary?.readMinutes ?? readMinutes(card.story),
      family: families[i],
      script: type.script,
      lang: type.lang,
    };
  });
}

/** The stills a scene draws, by slug (worked out on the server from the cast). */
export type Stills = Record<'tuck' | 'tag' | 'card' | 'dot' | 'night', Still>;

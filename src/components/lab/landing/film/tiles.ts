import type { Card, User } from '@/lib/db/types';
import { cardPalettes } from '@/lib/design/cardColours';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';
import { PICKS, type FilmModel, type FilmRelation, type FilmTile } from './model';

/**
 * At most this many stories after the leads — no more go into the page's payload (the review, round 3: twelve were
 * sent, seven used). The night sky shows three; the end's list reads `picks`, not these.
 */
export const SKY_TILES = 5;

/**
 * One card as the film shows it (oneday's tilesOf, ported): only what a card surface already shows — no author at all
 * for an anonymous card, and its link always by id (a slug may carry the pen name it was published under).
 */
export function tileOf(card: Card, authors: Record<string, User>, family: number): FilmTile {
  const prose = card.summary ? card.story : plainText(card.story);
  const type = storyType(card.thoughtCore, prose);
  const author = !card.anonymous ? authors[card.authorId] : undefined;
  const cover = card.media?.type === 'image' && card.media.url ? card.media.url : undefined;
  return {
    id: card.id,
    href: `/card/${card.anonymous ? card.id : card.slug ?? card.id}`,
    title: card.thoughtCore,
    // the landing page's excerpt (lib/adapters/story: EXCERPT_CHARS), so the cards read as its cards do
    excerpt: excerpt(prose),
    ...(cover ? { cover } : {}),
    tags: (card.tags ?? []).slice(0, 4),
    ...(author
      ? { author: { name: author.handle, initials: author.initials, ...(author.avatarUrl ? { avatar: author.avatarUrl } : {}), ...(author.avatarSeed ? { seed: String(author.avatarSeed) } : {}) } }
      : // the feed's anonymous byline: a wobble seeded from the card's id, carrying no identity (adapters/story)
        { anonSeed: String((card.id.charCodeAt(0) || 7) * 31) }),
    minutes: card.summary?.readMinutes ?? readMinutes(card.story),
    family,
    script: type.script,
    ...(type.lang ? { lang: type.lang } : {}),
  };
}

export interface FilmPicks {
  written: Card | null;
  answer: Card | null;
  relation: FilmRelation;
  sky: Card[];
  /** The end's list (data.ts: `recommendedIds`), best first; a list of its own, whatever the leads and the sky hold. */
  picks?: Card[];
  authors: Record<string, User>;
}

/**
 * A list of cards as tiles, coloured as a list of its own (cardPalettes: no card wears the family of the three before
 * it). Also what a signed-in reader's own picks become in the browser (personalPicks.ts), from the API's summaries.
 */
export function tilesOf(cards: Card[], authors: Record<string, User>): FilmTile[] {
  const families = cardPalettes(cards.map((c) => c.accentHue));
  return cards.map((c, i) => tileOf(c, authors, families[i]));
}

/**
 * The only thing the client sees (SPEC §2.3): tiles, families from cardPalettes over [a, b, ...sky]. B is the answer
 * the film shows — a real resonance, or (the owner's call, round 3) the nearest story, `kin` — and never in the sky.
 * The end's list (`picks`) is laid out apart from the film, so it is coloured apart too.
 */
export function toModel(f: FilmPicks): FilmModel {
  const leads = [f.written, f.answer].filter((c): c is Card => !!c);
  const list = [...leads, ...f.sky.filter((c) => !leads.some((l) => l.id === c.id))];
  const families = cardPalettes(list.map((c) => c.accentHue));
  const tiles = list.map((c, i) => tileOf(c, f.authors, families[i]));
  const a = f.written ? tiles[0] : null;
  // B answers A: with no A there is nothing to answer, and the card goes back among tonight's stories
  const answerTile = f.written && f.answer ? tiles[1] : null;
  const relation: FilmRelation = answerTile && f.relation !== 'alone' ? f.relation : 'alone';
  const b = relation === 'alone' ? null : answerTile;
  const rest = tiles.filter((t) => t !== a && t !== b);
  return { a, b, relation, sky: rest.slice(0, SKY_TILES), picks: tilesOf((f.picks ?? []).slice(0, PICKS), f.authors) };
}

/**
 * What the film's client code ever sees of a card (SPEC §2.3): built on the server by `toModel`, never a `Card`. No
 * slug field (the href carries the link: an anonymous card's always by id), no story, no read count, no signature.
 * Only what a card surface already shows: the title, the stored excerpt, the cover, the tags, the byline.
 */
export interface FilmTile {
  id: string;
  href: string;
  title: string;
  excerpt: string;
  cover?: string;
  /** Its tags, as the card shows them. */
  tags: string[];
  /** The byline; none for an anonymous card. `seed` is the avatar's wobble (the profile's, as the feed draws it). */
  author?: { name: string; initials: string; avatar?: string; seed?: string };
  /** An anonymous card's avatar wobble (from its id, as the feed's anonymous byline: no identity). */
  anonSeed?: string;
  minutes: number;
  /** Its card colour family (cardPalettes over the film's whole list). */
  family: number;
  script: 'cjk' | 'latin';
  lang?: string;
}

/**
 * How B stands to A: `resonance` it really answers A (its card page says so); `kin` the nearest story to A by someone
 * else (the film shows it as 聆聆's answer, and says it isn't one yet); `alone` no B (聆聆's answer is drawn).
 */
export type FilmRelation = 'resonance' | 'kin' | 'alone';

/** The end's list: this many recommended stories — whole rows of the grid on two columns and on three. */
export const PICKS = 6;

export interface FilmModel {
  /** The written card (摺摺's); null: the film draws its cards. */
  a: FilmTile | null;
  /** The answer card: a real resonance, else the nearest story (relation `kin`); null: 聆聆's answer is drawn. */
  b: FilmTile | null;
  relation: FilmRelation;
  /** Tonight's stories after A and B (the night sky's cards): at most five. */
  sky: FilmTile[];
  /**
   * The end's list: the stories recommended to anyone, best first, at most `PICKS` (data.ts: `recommendedIds`). A list
   * of its own — A and B may be among them like any card — carrying the order only, never what decided it.
   */
  picks: FilmTile[];
}

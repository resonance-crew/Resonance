import { CARD_BORDERS, CARD_FILLS, preferredPalette } from '@/lib/design/cardColours';
import { CARD_HUES } from '@/lib/design/dominantHue';
import { seedFromId } from '@/lib/design/bubble';
import { STORY_GRAIN } from '@/lib/design/grain';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wobRect } from '@/lib/design/wobRect';

/**
 * A story card made into a picture — the card recipe, written once: the apps'
 * 1080×1920 share image (drawn on the device, iOS ImageRenderer / Android
 * GraphicsLayer) takes these numbers from native/fixtures/share-card.json,
 * which shareCard.test.ts writes from SHARE_CARD (UPDATE_SHARE_CARD=1); the
 * web's 1200×630 link-preview image (/api/og/card, lib/og/cardImage) draws the
 * same card at its own size with the helpers below.
 *
 * Lengths are points (pt / dp) on the 360 × 640 canvas, before `scale`.
 * Type is named by the story's tokens (tokens.css, "A story's type": the apps
 * have them as Tokens.story*), never restated: a card shared from the reader
 * quotes the story in the type the reader sets it in — by its script
 * (lib/text/script storyScript): a CJK story's title in the story serif (Noto
 * Serif TC 600, +0.02em, lining figures) over the story sans with the story's
 * tracking; a Latin story's in Playfair 700 with lining figures over DM Sans.
 * Only the sizes and line budgets are the card's own.
 *
 * Colours: `cardFill` / `cardBorder` are the card's family (CARD_FILLS /
 * CARD_BORDERS, the apps' Tokens.cardFill{p} / cardBorder{p}); `paper` and
 * `rule` are oklch(lightness% chroma hue) with the family's hue (CARD_HUES[p]);
 * `--color-*` are tokens.css's.
 *
 * Never on the card: tags, read time, a region flag, counts, the URL path, a
 * QR code, anything shaped like a button, anything about the sharer. An
 * anonymous card's byline is 匿名 / Anonymous over the neutral "·" avatar —
 * never a photo, pen name, initials, region or verified mark.
 */

/** How to set one kind of text: a face and weight, tracking (em) and leading (× size), each a token's name or a number. */
export interface ShareType {
  face: '--font-story-serif' | '--font-story-sans' | '--font-heading' | '--font-body';
  weight: StoryTokenName | number;
  tracking: StoryTokenName | number;
  leading: StoryTokenName | number;
  figures?: 'lining';
  align?: 'justify' | 'start';
}

/**
 * The story tokens the card names, as tokens.css sets them — the server's
 * renderer reads no CSS. shareCard.test.ts pins every one to tokens.css.
 */
export const STORY_TOKENS = {
  '--story-heading-weight': 600,
  '--story-heading-weight-latin': 700,
  '--story-heading-tracking': 0.02,
  '--story-tracking': 0.03,
  '--story-title-leading': 1.4,
  '--story-title-leading-latin': 1.2,
  '--story-leading': 1.85,
  '--story-leading-latin': 1.65,
} as const;
export type StoryTokenName = keyof typeof STORY_TOKENS;

/** The colour tokens the card names, as tokens.css sets them (pinned by shareCard.test.ts). */
export const COLOUR_TOKENS = {
  '--color-text': 'oklch(26% 0.03 60)',
  '--color-text-muted': 'oklch(52% 0.04 70)',
  '--color-terracotta': 'oklch(62% 0.14 45)',
  '--color-cream-dark': 'oklch(93% 0.0126 75)',
} as const;
export type ColourTokenName = keyof typeof COLOUR_TOKENS;

/** A number of the recipe, whether written as one or as a story token's name. */
export function tokenValue(v: StoryTokenName | number): number {
  return typeof v === 'number' ? v : STORY_TOKENS[v];
}

/** The title's and the words' type, by the story's script. */
export const SHARE_TYPE = {
  title: {
    cjk: { face: '--font-story-serif', weight: '--story-heading-weight', tracking: '--story-heading-tracking', leading: '--story-title-leading', figures: 'lining' },
    latin: { face: '--font-heading', weight: '--story-heading-weight-latin', tracking: 0, leading: '--story-title-leading-latin', figures: 'lining' },
  },
  words: {
    cjk: { face: '--font-story-sans', weight: 400, tracking: '--story-tracking', leading: '--story-leading', align: 'justify' },
    latin: { face: '--font-body', weight: 400, tracking: 0, leading: '--story-leading-latin', align: 'start' },
  },
} as const satisfies Record<'title' | 'words', Record<'cjk' | 'latin', ShareType>>;

/** The 9:16 share image (the apps). */
export const SHARE_CARD = {
  canvas: { width: 360, height: 640, scale: 3, jpegQuality: 0.9 },
  /** Kept clear of Stories' own chrome: the card is centred between these. */
  safeZone: { top: 84, bottom: 527 },
  backdrop: { fill: 'cardFill', grain: STORY_GRAIN.band, grainTile: 'grain-overlay' },
  card: {
    width: 300,
    maxHeight: 443,
    padding: 22,
    paddingBottom: 22,
    radius: 22,
    /** wobRect(w, h, radius, seed, min(w, h) × magnitude, options), seed = seedFromId(card id). */
    outline: { magnitude: 0.025, segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.55, cornerJitter: 0.7, cornerOffset: 4 },
    paper: { lightness: 97.5, chroma: 0.012, grain: STORY_GRAIN.paper, grainTile: 'grain-card' },
    pen: { colour: 'cardBorder', width: INK },
  },
  cover: { ratio: 0.5, seedOffset: 5, grain: STORY_GRAIN.cover, gapBelow: 16 },
  title: {
    withCover: { size: 22, maxLines: 2 },
    withoutCover: { size: 26, maxLines: 3 },
    colour: '--color-text',
    gapBelow: 12,
    type: SHARE_TYPE.title,
  },
  words: {
    size: 14,
    withCover: { maxLines: 4 },
    withoutCover: { maxLines: 8 },
    colour: '--color-text',
    /** Omitted, with its gap, when the story has nothing to quote. */
    gapBelow: 16,
    /** lib/markdown/sharePassages `opening`; its line breaks are kept. */
    text: 'opening',
    type: SHARE_TYPE.words,
  },
  rule: { height: 6, colour: { lightness: 55, chroma: 0.04, alpha: 0.4 }, width: INK_LIGHT, seedOffset: 91, amplitude: 1.2, steps: 6, gapBelow: 14 },
  byline: {
    height: 32,
    avatar: { size: 30, outline: 'oklch(36% 0.06 60 / 0.55)', width: INK, fill: 'cardFill' },
    gap: 10,
    name: { size: 13, weight: 600, leading: 1.3, colour: '--color-text', face: '--font-body' },
    /** After the pen name, when the author is verified (the web's HandDrawnCheckmark). Never on an anonymous card. */
    verifiedMark: { size: 12, gap: 4 },
    date: { size: 11.5, weight: 400, colour: '--color-text-muted', face: '--font-body', style: 'medium' },
    /** The least room between the byline and the lockup. */
    minSpace: 8,
  },
  anonymous: {
    avatar: { initials: '·', fill: '--color-cream-dark', seed: 97 },
    name: { message: 'card.anonymousAuthor', colour: '--color-text-muted' },
  },
  /** Right-aligned at the byline's end, where a feed card has its →. */
  lockup: {
    wave: { icon: 'wave', size: 16, colour: '--color-terracotta', width: INK },
    gap: 4,
    wordmark: { text: 'Resonance', size: 13, weight: 700, tracking: -0.02, face: '--font-heading', colour: '--color-text' },
    domain: { text: 'resonance.channel', size: 10.5, weight: 400, tracking: 0.01, face: '--font-body', colour: '--color-text-muted' },
  },
  /** Instagram's movable layer: the card alone, with a transparent margin so the wobble isn't cut. */
  sticker: { margin: 6, scale: 2, format: 'png' },
  /** Instagram's background: the backdrop alone. */
  storiesBackground: { width: 1080, height: 1920, format: 'jpeg' },
} as const;

/** A card's colour family on a share card: its cover's, else one fixed by its id. */
export function sharePalette(card: { id: string; accentHue?: number | null }): number {
  return preferredPalette(card.accentHue, seedFromId(card.id));
}

/** A card's wobble seed on a share card. */
export function shareSeed(cardId: string): number {
  return seedFromId(cardId);
}

/** The colours of a family, as the card draws them (oklch() strings). */
export function shareColours(palette: number) {
  const hue = CARD_HUES[palette];
  const { paper } = SHARE_CARD.card;
  const { colour: rule } = SHARE_CARD.rule;
  return {
    hue,
    backdrop: CARD_FILLS[palette],
    paper: `oklch(${paper.lightness}% ${paper.chroma} ${hue})`,
    pen: CARD_BORDERS[palette][0],
    rule: `oklch(${rule.lightness}% ${rule.chroma} ${hue} / ${rule.alpha})`,
  };
}

/** The card's outline at `w` × `h` (radius in the same units), the desktop StoryCard's. */
export function shareOutline(w: number, h: number, radius: number, seed: number): string {
  const { magnitude, ...options } = SHARE_CARD.card.outline;
  return wobRect(w, h, radius, seed, Math.min(w, h) * magnitude, {
    ...options,
    segmentsH: [...options.segmentsH],
    segmentsV: [...options.segmentsV],
  });
}

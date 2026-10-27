/**
 * The landing stage's three versions, by the page's own breakpoints (CardLinkGrid's columns): a phone below 640 (one
 * column of cards, full-bleed bands), a tablet from 640 (two columns, the hero centred and tall), a desktop from 1024
 * (three columns, the QR code beside the badges when a mouse is there). What differs is how big the characters are,
 * how far the places sit from what they stand by, and which kinds of places there are; measure.ts finds the places
 * themselves on the page as it is.
 */
import type { StageOptions } from '../types';

export type PresetName = 'phone' | 'tablet' | 'desktop';

export interface LandingPreset {
  name: PresetName;
  /** Px for 摺摺 (420 rig units); the others follow the engine's heightCurve. */
  unitHeight: number;
  /** Px kept between the headline's two standing ends and the pill above its middle. */
  headlineGap: number;
  /** How far in from each end of the feed title's words its two standing spans reach. */
  titleReach: number;
  /** A stand spot's distance from the store badge(s) beside it (from the badges' column, beside a QR code). */
  badgeSide: number;
  /** Without a QR code: how far below the badges' foot the two spots beside them are (the paragraph is close above). */
  badgeDrop: number;
  /** 瀏覽所有故事: how far left of the button the leaning spot is. */
  browseOffset: number;
  /** The footer's logo: how far right of it the nap spot is. */
  logoOffset: number;
  /** Peeking over the avatar row (a phone's, where its line's end is off the page). */
  proofPeek: boolean;
  /** Standing at the end of the avatar row's line. */
  proofEnd: boolean;
  /** Peeking past the outer cards' sides (there is a page margin to show in). */
  cardPeeks: boolean;
  /** There is room to walk up to someone standing by the badges or the browse button. */
  walkUp: boolean;
  /** The engine's options (the rest are its defaults: the prototype's pacing, approved). */
  options: Partial<StageOptions>;
}

/** The widths the presets start at, as the page's CSS has them (min-width media queries). */
export const TABLET_MIN = 640;
export const DESKTOP_MIN = 1024;

export const PRESETS: Readonly<Record<PresetName, LandingPreset>> = {
  // 80 (owner-approved round 3): at 88 摺摺 was twice the 41 px headline and two on the first screen crowded it
  phone: {
    name: 'phone', unitHeight: 80, headlineGap: 7, titleReach: 40, badgeSide: 46, badgeDrop: 18, browseOffset: 38, logoOffset: 42,
    proofPeek: true, proofEnd: false, cardPeeks: false, walkUp: false, options: {},
  },
  // 100: between the two, as the page is — its headline (54 px at 834) is 1.4× a phone's and 0.7× a desktop's, its
  // cards (363 px) nearly a desktop's (384), its badges a desktop's 44 px; 摺摺 is the badge's height twice and a bit,
  // a quarter of a card's width, as on a desktop
  tablet: {
    name: 'tablet', unitHeight: 100, headlineGap: 14, titleReach: 64, badgeSide: 50, badgeDrop: 24, browseOffset: 45, logoOffset: 48,
    proofPeek: true, proofEnd: true, cardPeeks: true, walkUp: true, options: {},
  },
  // 120 (owner-approved round 3): as tall as the QR card, half again the headline
  desktop: {
    name: 'desktop', unitHeight: 120, headlineGap: 20, titleReach: 90, badgeSide: 62, badgeDrop: 24, browseOffset: 52, logoOffset: 54,
    proofPeek: false, proofEnd: true, cardPeeks: true, walkUp: true, options: {},
  },
};

/** The preset for a page this wide (CSS px, as a min-width media query reads it). */
export function presetFor(width: number): LandingPreset {
  return width >= DESKTOP_MIN ? PRESETS.desktop : width >= TABLET_MIN ? PRESETS.tablet : PRESETS.phone;
}

/** The media queries that switch presets: listen to them, and ask presetIn() again when one changes. */
export function presetQueries(win: Window): MediaQueryList[] {
  return [win.matchMedia(`(min-width: ${DESKTOP_MIN}px)`), win.matchMedia(`(min-width: ${TABLET_MIN}px)`)];
}

/** The preset the window's width calls for, read as the page's CSS reads it (scrollbar included). */
export function presetIn(win: Window): LandingPreset {
  const [desktop, tablet] = presetQueries(win);
  return desktop.matches ? PRESETS.desktop : tablet.matches ? PRESETS.tablet : PRESETS.phone;
}

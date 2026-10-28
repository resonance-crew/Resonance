/**
 * The reading pages' stage (the home feed and a card's page — round 19, the owner's: 「偶爾會出現的小精靈」, behind a
 * switch in settings, off until turned on): the landing stage's three widths, smaller puppets, and a visitor now and
 * then rather than one after another — the reader came to read. The apps' mascot island (native/mascots) runs the same
 * presets by the width it is given.
 */
import type { StageOptions } from '../types';
import { DESKTOP_MIN, TABLET_MIN, type PresetName } from '../landing/presets';

export interface ReadingPreset {
  name: PresetName;
  /** Px for 摺摺 (420 rig units): a little smaller than the landing page's (80 / 100 / 120). */
  unitHeight: number;
  /** A margin beside the story at least this wide (× unitHeight) has places to stand in. */
  marginRoom: number;
  /** Peeking past the outer feed cards' sides (there is a page margin to show in). */
  cardPeeks: boolean;
  options: Partial<StageOptions>;
}

/**
 * Seldom and one at a time: the first comes after half a minute or so, then one every two minutes or so, and a meeting
 * only now and then. A visit itself is the landing page's (approved pacing).
 */
export const READING_PACE: Partial<StageOptions> = {
  first: [24, 48],
  gap: [80, 160],
  visit: [11, 17],
  pairChance: 0.04,
  meetChance: 0.15,
  greetChance: 0.5,
  meetEvery: 240,
};

export const READING_PRESETS: Readonly<Record<PresetName, ReadingPreset>> = {
  phone: { name: 'phone', unitHeight: 68, marginRoom: 1, cardPeeks: false, options: READING_PACE },
  tablet: { name: 'tablet', unitHeight: 84, marginRoom: 0.85, cardPeeks: true, options: READING_PACE },
  desktop: { name: 'desktop', unitHeight: 100, marginRoom: 0.85, cardPeeks: true, options: READING_PACE },
};

/** The preset for a page this wide (CSS px). */
export function readingPresetFor(width: number): ReadingPreset {
  return width >= DESKTOP_MIN ? READING_PRESETS.desktop : width >= TABLET_MIN ? READING_PRESETS.tablet : READING_PRESETS.phone;
}

export function readingPresetQueries(win: Window): MediaQueryList[] {
  return [win.matchMedia(`(min-width: ${DESKTOP_MIN}px)`), win.matchMedia(`(min-width: ${TABLET_MIN}px)`)];
}

export function readingPresetIn(win: Window): ReadingPreset {
  const [desktop, tablet] = readingPresetQueries(win);
  return desktop.matches ? READING_PRESETS.desktop : tablet.matches ? READING_PRESETS.tablet : READING_PRESETS.phone;
}

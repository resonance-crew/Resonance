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
 * Seldom and mostly one at a time: the first comes after a quarter of a minute or so, then one every minute or two;
 * now and then a second comes to greet it or two meet on a phone's band (round 20: more than one way a visit goes).
 * A visit itself is the landing page's (approved pacing).
 */
export const READING_PACE: Partial<StageOptions> = {
  first: [12, 30],
  gap: [60, 130],
  visit: [11, 17],
  pairChance: 0.1,
  meetChance: 0.3,
  greetChance: 0.6,
  meetEvery: 120,
};

/**
 * Settings' strip under the 小紙團 switch (round 20): awake, someone is nearly always there — the next one walks in
 * a moment after the last goes, and two often meet; asleep (the switch off), one comes at once and naps all day.
 */
export const SETTINGS_AWAKE: Partial<StageOptions> = {
  first: [0.3, 0.8],
  gap: [1.2, 3],
  visit: [9, 14],
  pairChance: 0.2,
  meetChance: 0.45,
  greetChance: 0.8,
  meetEvery: 20,
  greetEvery: 12,
};
export const SETTINGS_ASLEEP: Partial<StageOptions> = {
  first: [0.2, 0.5],
  gap: [0.5, 1],
  visit: [86400, 86400],
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
};

/**
 * Px for 摺摺 on settings' strip, as wide as it is: a little smaller than the reading pages', so 牽牽 (1.3 × that,
 * the tallest) stands inside the strip — 104 px tall on a phone, 116 wider (SettingsClient.module.css; the apps'
 * strips the same), its stage reaching STRIP_HEADROOM above it for raised arms.
 */
export function settingsUnit(width: number): number {
  return width >= 480 ? 68 : 60;
}

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

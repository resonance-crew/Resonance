// A list's rows parted into bands (round 23 §4/§5, the owner: 「沒有真的一個 border，只是…用這一條有機的曲線分開的
// 區塊」): no rule between them — each row is the paper between two hand-drawn curves it shares with its
// neighbours, seen only as the edge of its wash (a pointer over it, a finger's press); at rest nothing is drawn.
// The rows touch (`BAND_ROW_PAD` above and below each row's content, no gap) and the band runs the list's whole
// width while the content keeps its column. The bell's list (its page and its dialog) and a phone's conversation
// list wear it; the apps' twins are Android's ListBands.kt and iOS's notifications screen.
//
// Each curve is seeded by the key of the row BELOW it, never by a place in the list: a notification arriving on
// top moves no other curve. A row's top curve is its own key's, its bottom one the next row's — or, above a part's
// title, that title's key; the list's last row ends on `BAND_END_KEY` (`bandsBelow`). Pure and seeded, so the
// server's HTML and the browser draw the same curves.

import { seedFromString } from './prng';
import { rowBoundary, segs } from './rowMenu';

/** How far a band's curve swings about the row's edge: the menu sheets' 2. */
export const BAND_AMP = 2;

/** Above and below each row's content; the bands touch (gap 0). */
export const BAND_ROW_PAD = 12;

/** A part's title between the bands: this much bare paper past the farthest a band's curve can reach. */
export const BAND_TITLE_CLEAR = 4;

/** A title's own room toward a band: the curve's swing and `BAND_TITLE_CLEAR`. */
export const BAND_TITLE_TO_BAND = BAND_AMP + BAND_TITLE_CLEAR;

/** A finger (or a button) held this long on a row before its band shows: a scroll starting sooner shows nothing. */
export const BAND_PRESS_DELAY_MS = 80;

/** The washes toward the ink, in percent: a fine pointer over a band, and a press (the same mixes at night). */
export const BAND_HOVER_MIX = 6;
export const BAND_PRESS_MIX = 12;

/** Where the last band of a list ends: its bottom curve's key. */
export const BAND_END_KEY = 'bands:end';

/** A band's turns across `w` px: one every ~100, never fewer than a menu's 4 (so a window-wide band is never nearly straight). */
export function bandSteps(w: number): number {
  return Math.max(4, Math.round(w / 100));
}

/** A curve's seed: its key's (the row below it), never its index. */
export function bandSeed(key: string): number {
  return seedFromString(key);
}

/** The curve `key` draws at `y` across a band `w` wide: flat where it meets the band's ends. */
export function bandCurve(y: number, w: number, key: string): [number, number][] {
  return rowBoundary(y, w, bandSeed(key), BAND_AMP, 0, bandSteps(w));
}

/**
 * A row's band, `w` × `h`, as a closed path: its own curve (`topKey`'s) along the top, the one under it
 * (`bottomKey`'s) along the bottom — each swinging `BAND_AMP` about the row's edge, so the path reaches a little
 * past the box (drawn unclipped). Two rows touching share the curve between them exactly: the upper row's bottom
 * is the lower row's top, moved down by the upper row's height.
 */
export function bandRegion(w: number, h: number, topKey: string, bottomKey: string): string {
  const top = bandCurve(0, w, topKey);
  const back = [...bandCurve(h, w, bottomKey)].reverse();
  return `M ${top[0][0]},${top[0][1]}` + segs(top) + ` L ${back[0][0]},${back[0][1]}` + segs(back) + ' Z';
}

/** The key of the curve under each row of `keys`: the next row's, and after the last, `after` (a title's key, or the list's end). */
export function bandsBelow(keys: readonly string[], after: string): string[] {
  return keys.length ? [...keys.slice(1), after] : [];
}

/**
 * A path of absolute commands with `x,y` pairs (wobRect's, rowMenu's) moved by `dx`, `dy`: a dialog's outline in the
 * coordinates of a box inside it (the bell's list clips its bands to the dialog's wobble — see NotificationBell).
 */
export function translatePath(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  const f = (n: number): number => +n.toFixed(2);
  return d.replace(/(-?\d*\.?\d+(?:e[-+]?\d+)?),(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi, (_, x: string, y: string) => `${f(+x + dx)},${f(+y + dy)}`);
}

/**
 * The film's light as it is drawn (round 25 §A — the owner: 「这些圆这些卡片它都是一节一节慢慢变暗或是变亮…让它看起来更
 * 线性一点」). Pure, no DOM: for an hour it says what each scenery paint is to show. runtime/director.ts draws from it
 * (lightAt, paletteOf, the partitions below) and script/light.test.ts holds it to the exact hour, so the measure and
 * the drawing cannot drift apart.
 *
 * - **The planes' paper** (every paint but the light's: the hills, the sea, the town, the trees' round canopies, the
 *   bridge…) **while a scene is at rest** (`restAt`) never steps on screen: each live plane carries two paints, the
 *   key below the hour and the key above it (1/PAPER_KEYS of an hour apart), the upper one over the lower, and per
 *   frame only the upper one's opacity moves — the compositor's work. A paint is rewritten only while it is fully
 *   hidden (the lower under the upper at 1, the upper at 0), so the two swap roles at each key. That is where the
 *   owner saw the steps ripple from plane to plane: the dawn while 摺摺 writes, the dusk on the bridge.
 * - **Through a scene change** (and FOLD_LEAD before it, UNFOLD_AFTER after it) the paper is drawn as main draws it:
 *   one paint per plane, a step every 1/PAPER_KEYS_IN_CHANGE of an hour, the planes taking it one a frame. There the
 *   planes fly, and a copy flying with each of them is what WebKit cannot afford (round 25, pass 3: the copies' layers
 *   alone, never updated, cost c1 two to three times main's dropped frames); the flight covers the steps. No copy is
 *   displayed there at all (`display: none`: no layer).
 * - **The seams.** Out of rest, each plane folds into one paint written whole at the exact hour (FOLDS_PER_FRAME a
 *   frame from FOLD_LEAD before the change): what shows moves by no more than the pair's own distance from the exact
 *   hour (0.005) plus a frame of the hour. Into rest, a plane unfolds when main's own queue writes it its next twelfth
 *   (the step main itself makes there): its copy appears hidden at opacity 0 holding the key above, and fades on.
 * - **The light** (LIGHT_VAR: the sky, the disc and its halo, the clouds, the stars, the birds, the wind, the chrome)
 *   is written whole from the hour every 1/LIGHT_STEPS of a film-hour, as main did. Written finer it repaints the
 *   whole viewport's sky (and the clouds and the disc) on nearly every frame of a change, and headed WebKit then drops
 *   to about half the frame rate (round 25, the web lane's measures: 1/120 → p50 40–45 ms through c2→c3, 1/12 → 17 ms).
 * - What wears the paper's paints besides the planes takes them as on main: the disc's rim, the birds', the tissue
 *   strips at main's steps of the paper; a flown flat's haze, the sea's reflection of the disc and an apron under a
 *   torn foot from their plane's own paint (the lower of a pair: they sit outside its copy, a twelfth's step at most
 *   from what the pair shows, and only the reflection is seen at rest).
 * - The stills (`?rest=1`, the capture screens) are drawn exactly as main draws them: every plane whole at main's key,
 *   no copy displayed. Paused, the paper settles whole on the exact hour, with no upper paint showing.
 */
import { paletteAt, type LCH } from './palette';
import { SEGMENTS } from './timeline';

/** Keys of the planes' paper, per film-hour. */
export const PAPER_KEYS = 12;
/** Main's steps of the paper through a scene change, per film-hour (where the hour runs fastest and the planes fly). */
export const PAPER_KEYS_IN_CHANGE = 4;
/** Seconds before a change the planes start folding into one paint (FOLDS_PER_FRAME a frame: done before it starts),
 *  and after one before they may unfold (the planes' settling bounce is over by the change's end; a little air). */
export const FOLD_LEAD = 0.5;
export const UNFOLD_AFTER = 0.25;
export const FOLDS_PER_FRAME = 2;
/**
 * The bounds the drawing is held to (script/light.test.ts, runtime/director.test.tsx). Main's own largest step of a
 * plane's paper: at rest (a twelfth of an hour, `--film-c-range` at dawn) and through a change (a quarter, and the
 * quarter grid taken up at the change's start: `--film-c-tree` early in c2). The fold's seam: the pair's distance from
 * the exact hour (0.005) plus a frame of the hour's own motion. The light still steps a twelfth (`--film-c-bird`).
 */
export const MAIN_STEP_AT_REST = 0.021;
export const MAIN_STEP_IN_CHANGE = 0.133;
export const FOLD_SEAM = 0.0065;
export const LIGHT_STEP = 0.045;
/** How often the light is written, per film-hour (main's pace: finer costs WebKit half its frames, see above). */
export const LIGHT_STEPS = 12;

/** The variables of the light itself — the sky, the disc and its glow, the clouds, the stars, the chrome — cheap to
 *  repaint; every other one is the planes' paper. */
export const LIGHT_VAR = /^--film-(sky-|c-(disc|halo|cloud|streak|bird|wind|fly)|stars|cloud-|chrome-|night$)/;
/** The light's paints the planes' parts wear too: the disc's (the sea's reflection of it), the haze's (a flown flat's). */
export const PLANE_LIGHT = /^--film-c-(disc|fly)/;
/** A scenery paint (a colour of the world): the sky's and the `--film-c-*` paints. Not the chrome's ink — the header's,
 *  which flips between cream and graphite by design — nor the numbers (windows, stars, mist). */
export const isSceneryPaint = (k: string) => /^--film-(sky-\d|c-)/.test(k);

/**
 * The twelfths of an hour cut in two: the golden hour turning into the sunset, where the paper goes the long way round
 * the hue (palette.ts `mixKey`) and a twelfth's straight mix would stray 0.006 from it. Key indices (hour × 12).
 */
export const FINE_KEYS: readonly number[] = [198, 199];

export interface LightAt {
  /** The hour the light is written for. */
  light: number;
  /** The planes' paper: the lower key's hour, the upper key's, and the upper one's opacity. */
  paper: { lo: number; hi: number; mix: number };
}

/**
 * What is drawn for an hour: the light's hour, and the paper's two keys and their mix. `rest` (the lab's `?rest=1`:
 * the stills and the capture screens) draws as main does — the paper whole at its twelfth, the light at its step, so
 * the screenshots' baseline cannot move; `still` (the film paused or held
 * still a moment) draws the paper whole at the exact hour and leaves the light where its step is — rewriting the light
 * there would be a step of its own.
 */
export function lightAt(hour: number, { rest = false, still = false }: { rest?: boolean; still?: boolean } = {}): LightAt {
  const light = Math.floor(hour * LIGHT_STEPS + 1e-9) / LIGHT_STEPS;
  if (rest) return { light, paper: { lo: flatKey(hour, false), hi: flatKey(hour, false), mix: 0 } };
  if (still) return { light, paper: { lo: hour, hi: hour, mix: 0 } };
  const x = hour * PAPER_KEYS;
  const k = Math.floor(x + 1e-9);
  const f = Math.min(1, Math.max(0, x - k));
  if (FINE_KEYS.includes(k)) {
    const half = f >= 0.5 ? 0.5 : 0;
    return { light, paper: { lo: (k + half) / PAPER_KEYS, hi: (k + half + 0.5) / PAPER_KEYS, mix: Math.min(1, (f - half) * 2) } };
  }
  return { light, paper: { lo: k / PAPER_KEYS, hi: (k + 1) / PAPER_KEYS, mix: f } };
}

/** Whether a scene is at rest at film time s: no change within FOLD_LEAD ahead nor UNFOLD_AFTER behind. */
export function restAt(s: number): boolean {
  for (const seg of SEGMENTS) {
    if (seg.kind !== 'change') continue;
    if (s > seg.t0 - FOLD_LEAD && s < seg.t1 + UNFOLD_AFTER) return false;
  }
  return true;
}

/** Main's one paint of a plane at an hour (through a change a quarter-hour step, a twelfth elsewhere). */
export const flatKey = (hour: number, inChange: boolean) => {
  const per = inChange ? PAPER_KEYS_IN_CHANGE : PAPER_KEYS;
  return Math.floor(hour * per + 1e-9) / per;
};

const memo = new Map<string, Record<string, string>>();
/** paletteAt, kept for the hours it is asked for most (the keys and the light's steps are a grid). */
export function paletteOf(hour: number, dim: boolean): Record<string, string> {
  const key = `${hour.toFixed(6)}|${dim}`;
  let p = memo.get(key);
  if (!p) {
    if (memo.size > 4000) memo.clear();
    p = paletteAt(hour, { dim });
    memo.set(key, p);
  }
  return p;
}

/** Per scenery paint at an hour: the two values drawn and the upper one's share (a light paint: the same twice, 0). */
export function shownPaints(
  hour: number,
  { dim = false, rest = false, still = false }: { dim?: boolean; rest?: boolean; still?: boolean } = {},
): Record<string, { a: string; b: string; mix: number }> {
  const at = lightAt(hour, { rest, still });
  const light = paletteOf(at.light, dim);
  const lo = paletteOf(at.paper.lo, dim);
  const hi = paletteOf(at.paper.hi, dim);
  const out: Record<string, { a: string; b: string; mix: number }> = {};
  for (const k of Object.keys(light)) {
    if (!isSceneryPaint(k)) continue;
    out[k] = LIGHT_VAR.test(k) ? { a: light[k], b: light[k], mix: 0 } : { a: lo[k], b: hi[k], mix: at.paper.mix };
  }
  return out;
}

/* ───────────── colour: what the screen shows of a mix ───────────── */

/** An `oklch(L% C h)` / `oklch(L% C h / a)` as paletteAt writes it. */
export function parseOklch(v: string): LCH {
  const m = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/.exec(v);
  if (!m) throw new Error(`not an oklch colour: ${v}`);
  return [Number(m[1]) / 100, Number(m[2]), Number(m[3])];
}

const dec = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** OKLab of an encoded sRGB colour. */
export function oklabOfSrgb([r, g, b]: LCH): LCH {
  const R = dec(r);
  const G = dec(g);
  const B = dec(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** ΔE in OKLab. */
export const deltaE = (a: LCH, b: LCH) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Every scene ends on a floor (the theatre's one rule): its content, a puppet lane one character tall, then the floor
 * — a gently wobbling pen line on the next scene's paper, with two paper flats (ground rows, wavier) behind it that
 * slide past each other as the page scrolls. The flats are the scene change; the floor stays where it is, so a puppet
 * standing on it is never moved by the scroll.
 *
 * All of it is drawn in a 1440 × 100 view box stretched to the box (x by its width, y by its height), so the floor's
 * height at a fraction of the width is the same at every width: the stills in the server's HTML and the live stages
 * read one line.
 */
import { wavyPoints, pointsToBezier } from '@/lib/design/wavyPath';

export const VIEW_W = 1440;
export const VIEW_H = 100;

/** Where the floor line runs, in the view box (the flats' own waves are above it). */
export const FLOOR_AT = 74;

export type Pt = [number, number];

/** Each scene's floor, by seed: the stills (server) and the stages (client) read the same line. */
export const FLOOR_SEED = { hero: 31, stories: 57, answer: 83, stage: 97, dusk: 109, call: 131 } as const;

/** The floor: a hand's straight line across the scene, a couple of px either way. */
export function floorPoints(seed: number): Pt[] {
  return wavyPoints(VIEW_W, FLOOR_AT, 2.2, seed, 9);
}

/** A flat's top: the brand's section wave (a swell and a few turns), `at` down the box. */
export function flatPoints(seed: number, at: number, swell: number, steps = 9): Pt[] {
  return wavyPoints(VIEW_W, at, swell, seed, steps);
}

/** The paper under a top line, down to the box's foot. */
export function fillUnder(pts: Pt[]): string {
  const top = pointsToBezier(pts);
  return `${top} L ${VIEW_W},${VIEW_H + 1} L 0,${VIEW_H + 1} Z`;
}

/** The line's y (view units) at view x. */
export function yAt(pts: readonly Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) {
      // the bezier through horizontal handles is a smooth step between its two points
      const t = (x - x0) / (x1 - x0 || 1);
      const s = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * s;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * The floor in a box's px: `top` is the flats box's top, `w`/`h` its size. Points every ~24 px, so a walk follows it.
 */
export function floorInPx(seed: number, top: number, w: number, h: number, step = 24): Pt[] {
  const pts = floorPoints(seed);
  const n = Math.max(4, Math.round(w / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    out.push([x, top + (yAt(pts, (x / w) * VIEW_W) / VIEW_H) * h]);
  }
  return out;
}

/** The floor's height (px from the flats box's top) at a fraction of the width. */
export function floorAtFrac(seed: number, frac: number, h: number): number {
  return (yAt(floorPoints(seed), frac * VIEW_W) / VIEW_H) * h;
}

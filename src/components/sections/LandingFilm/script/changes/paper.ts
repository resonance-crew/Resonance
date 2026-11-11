/**
 * The tissue's paper the scene changes share (flats.ts, mist.ts): a cloud layer and a streak, each a path in a
 * 1000 × 100 box (in square units: a strip is ten times wider than tall). Its own module, so the film's default style
 * (flats) carries none of the lab's other styles. Pure.
 */
import { ellipse, path, ribbon, rng, tear, type Pt } from '../geom';

/**
 * A cloud layer: a long tissue band (from `top` to `bottom`) with a row of torn puffs along its top. Its `crest` is the
 * same paper a little up and to the left and a little shallower — laid lighter over the layer, it leaves a sliver of
 * the layer's own deeper tone along each puff's lower right and along the layer's foot (the sky's paper clouds'
 * shading), and nothing of it anywhere else (no stray crescents in the dips of the layer in front).
 */
export function cloudPaper(seed: number, top: number, bottom: number, r0: number, r1: number, crest = false): string {
  const r = rng(seed);
  const ph = r() * 6.3;
  const ph2 = r() * 6.3;
  const ox = crest ? -3 : 0;
  const oy = crest ? -2.5 : 0;
  const s = crest ? 0.93 : 1;
  const topAt = (x: number) => top + 2.5 * Math.sin(x / 83 + ph) + 1.5 * Math.sin(x / 29 + ph2);
  const lowAt = (x: number) => bottom + 3 * Math.sin(x / 61 + ph2) + 2 * Math.sin(x / 19 + ph) - (crest ? 7 : 0);
  const base: Pt[] = [];
  for (let x = -20; x <= 1020; x += 8) base.push([x + ox, topAt(x) + oy]);
  for (let x = 1020; x >= -20; x -= 8) base.push([x + ox, lowAt(x) + oy]);
  let d = path(tear(base, seed + (crest ? 2 : 1), { amp: 1, jag: 0.6, wander: 1.4 }), true, 1);
  let x = -30;
  let i = 0;
  while (x < 1030) {
    const big = r() < 0.28;
    const R = big ? r1 * (0.82 + r() * 0.18) : r0 + r() * (r1 - r0) * 0.5;
    const n = Math.max(14, Math.round(R * 1.3));
    d += path(tear(ellipse(x + ox, topAt(x) + R * 0.32 + oy, R * 1.06 * s, R * 0.8 * s, n), seed + (crest ? 511 : 11) + i, { amp: 1, jag: 0.5, wander: 1.2 }), true, 1);
    x += R * (1.05 + r() * 0.45);
    i++;
  }
  return d;
}

/** A thin tissue streak (a long ribbon, tapered at its ends). */
export function streakPaper(seed: number, thick: number): string {
  const r = rng(seed);
  const ph = r() * 6.3;
  const line: Pt[] = [];
  for (let x = 0; x <= 1000; x += 10) line.push([x, 50 + Math.sin(x / 140 + ph) * 4]);
  return path(tear(ribbon(line, thick, 0.45), seed + 1, { amp: 1, jag: 0.6, wander: 1.6 }), true, 1);
}

/**
 * The stage's small math: easing curves, rects, and the polylines ledges are drawn as.
 */
import type { Point, Rect } from './types';

export const DEG = Math.PI / 180;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
export const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** 0 → 1 → 0 across [0, 1], easing in over `a` and out over `b`. */
export const bell = (u: number, a = 0.2, b = a): number => smooth(u / a) * smooth((1 - u) / b);
export const easeOut = (u: number): number => 1 - (1 - clamp(u, 0, 1)) ** 3;

/** Do two rects overlap, `m` px of margin counted? */
export function overlaps(a: Rect, b: Rect, m = 0): boolean {
  return a.x < b.x + b.w + m && a.x + a.w > b.x - m && a.y < b.y + b.h + m && a.y + a.h > b.y - m;
}

/** y of a polyline (x ascending) at x, flat past its ends. */
export function pathY(points: readonly Point[], x: number): number {
  const n = points.length;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
}

/** The highest point of a polyline across [x0, x1]: feet rest on the tallest thing under them. */
export function topY(points: readonly Point[], x0: number, x1: number): number {
  let y = Math.min(pathY(points, x0), pathY(points, x1));
  for (const [px, py] of points) if (px > x0 && px < x1) y = Math.min(y, py);
  return y;
}

/** A seeded [0, 1) source (mulberry32): the same seed, the same visitors. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

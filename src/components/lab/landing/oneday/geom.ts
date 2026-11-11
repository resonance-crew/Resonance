/**
 * What a scene reads of what it drew (loaded with the stages, never on the first paint): an element's box in the
 * scene's px, and a Paper's drawn outline as something to be behind — its top to sit on, its sides to peek past, cut
 * along the pen line's outer edge (the whole line stays in front of the puppet).
 */
import { flattenPath } from '@/lib/mascots/landing/svgPath';
import { sideOf, topOf } from '@/lib/mascots/reading/scene';
import type { Cover, Point, Rect } from '@/lib/mascots/types';
import { INK } from '@/lib/design/strokes';
import { floorInPx } from './floor';

export function rectIn(root: Element, el: Element | null): Rect | null {
  if (!el) return null;
  const a = root.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (!b.width && !b.height) return null;
  return { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height };
}

/** A Paper (or any element holding a stroked `[data-outline]` path) as a cover, in `root`'s px. */
export function coverOf(root: Element, el: Element | null, radius = 18): Cover | null {
  const box = rectIn(root, el);
  if (!el || !box) return null;
  const path = el.querySelector<SVGGeometryElement>('path[data-outline]');
  const r = root.getBoundingClientRect();
  let pts: Point[] = [];
  if (path) {
    try {
      const m = path.getScreenCTM();
      const d = path.getAttribute('d');
      if (m && d) {
        const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
        pts = (flattenPath(d, 4 / scale) ?? []).map(([x, y]) => [m.a * x + m.c * y + m.e - r.left, m.b * x + m.d * y + m.f - r.top]);
      }
    } catch {
      pts = [];
    }
  }
  if (pts.length < 8) return { ...box, radius };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const ext: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return {
    ...ext,
    top: topOf(pts, ext),
    radius,
    pen: INK,
    sides: { left: sideOf(pts, ext, 'left', radius), right: sideOf(pts, ext, 'right', radius) },
  };
}

/** A stretch of a cover's drawn top round `x` (± half), a hair down onto the line: a seat. */
export function seatOn(c: Cover, x: number, half: number): Point[] {
  const drawn = (c.top ?? []).filter(([px]) => px >= x - half && px <= x + half).map(([px, py]): Point => [px, py + 2]);
  return drawn.length >= 2 ? drawn : [[x - half, c.y + 2], [x + half, c.y + 2]];
}

/** The floor line of the `[data-flats]` box under `root`, in `root`'s px (empty if there is none). */
export function floorOf(root: Element, seed: number, selector = '[data-flats]'): { pts: Point[]; box: Rect } | null {
  const box = rectIn(root, root.querySelector(selector));
  if (!box) return null;
  return { pts: floorInPx(seed, box.y, box.w, box.h).map(([x, y]): Point => [x + box.x, y]), box };
}

/** The floor's y at x (root px). */
export function floorYAt(pts: readonly Point[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return pts[pts.length - 1][1];
}

/** Points moved into a layer whose box starts at (dx, dy). */
export const shift = (pts: readonly Point[], dx: number, dy: number): Point[] => pts.map(([x, y]): Point => [x - dx, y - dy]);

/** A cover moved into a layer's px. */
export function shiftCover(c: Cover, dx: number, dy: number): Cover {
  return {
    ...c,
    x: c.x - dx,
    y: c.y - dy,
    top: c.top && shift(c.top, dx, dy),
    sides: c.sides && { left: c.sides.left && shift(c.sides.left, dx, dy), right: c.sides.right && shift(c.sides.right, dx, dy) },
  };
}

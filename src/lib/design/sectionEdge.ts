import { wavyPoints } from './wavyPath';

/**
 * The wave between two bands of a page (atoms/SectionEdge), as geometry: one
 * place for the edge itself and for whatever must follow it exactly — a
 * band's drifting blobs, clipped to the paper between its two waves.
 *
 * Drawn in a box `height` px tall spanning the band's width, from a 1440-wide
 * view box stretched to that width (its y is the box's px). A wide band takes
 * the turns it is given; a narrower one takes one per ~100 px (4 at the
 * fewest) and a lower swell, down to 55 % on a phone — so a phone's edge is a
 * gentle line, not a desktop's turns squeezed into a third of the room.
 */

export const EDGE_VIEW_W = 1440;

export interface EdgeSpec {
  seed: number;
  /** The edge box's height (px); the wave sits at 78 % of it. */
  height: number;
  /** The swell, as a fraction of the height. */
  amplitude: number;
  /** Its turns at full width. */
  steps: number;
}

/** Below this width an edge takes fewer turns and a lower swell. */
const FULL_WIDTH = 1024;

/** The wave's points in view-box units for a band `width` px wide (null: not measured yet — drawn as a wide one). */
export function edgePoints(spec: EdgeSpec, width: number | null): [number, number][] {
  const narrow = width !== null && width < FULL_WIDTH;
  const steps = narrow ? Math.min(spec.steps, Math.max(4, Math.round(width / 100))) : spec.steps;
  const swell = narrow ? Math.max(0.55, width / FULL_WIDTH) : 1;
  // A phone's wave is a shape of its own, not the desktop's with turns left out.
  const seed = width !== null && width < 640 ? spec.seed + 9173 : spec.seed;
  return wavyPoints(EDGE_VIEW_W, spec.height * 0.78, spec.height * spec.amplitude * swell, seed, steps);
}

const f = (n: number) => +n.toFixed(2);

/**
 * The wave as path segments through `pts`, scaled by `sx` across and shifted
 * `dy` down: smooth through horizontal handles, as pointsToBezier. Starts with
 * an `L` to its first point (so it can continue a path), backwards when asked.
 */
export function waveSegments(pts: [number, number][], sx = 1, dy = 0, backwards = false): string {
  const p = backwards ? [...pts].reverse() : pts;
  let out = `L ${f(p[0][0] * sx)},${f(p[0][1] + dy)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const mid = ((x0 + x1) / 2) * sx;
    out += ` C ${f(mid)},${f(y0 + dy)} ${f(mid)},${f(y1 + dy)} ${f(x1 * sx)},${f(y1 + dy)}`;
  }
  return out;
}

/**
 * The paper between a band's own wave (`top`, at its top; none for the page's
 * first band) and the next band's (`next`, which starts `height` px down), as
 * a clip path in px for a box `width` × (`height` + the next edge's height)
 * from the band's top. `inset` keeps a hair off each wave, so what is clipped
 * leaves the edge's pen line showing.
 */
export function bandClipPath(
  top: EdgeSpec | null,
  next: EdgeSpec | null,
  width: number,
  height: number,
  inset = 1,
): string {
  const sx = width / EDGE_VIEW_W;
  const head = top ? waveSegments(edgePoints(top, width), sx, inset) : `L 0,-2000 L ${f(width)},-2000`;
  const foot = next ? waveSegments(edgePoints(next, width), sx, height - inset, true) : `L ${f(width)},${f(height)} L 0,${f(height)}`;
  return `M ${head.slice(2)} ${foot} Z`;
}

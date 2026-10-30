/**
 * What 聆聆's pack needs that the kit lacks.
 *
 * - `ink(nod, name, markup)`: pencil or crayon drawn straight onto its card — an SVG in rig units laid just above its
 *   torso (so it tips, squashes and sways with the card, and the face, the beret and arms brought to the front stay
 *   over it). `WRITTEN` is its card written full: the rig's own `torso-alt` has every rule written in fine pencil, which
 *   turns to grey grime at chat sizes, so this is the same idea in fewer, bolder lines (round 22 review §3 H).
 * - The beret held off its head: `hatAt` (by its middle), `hatByGrip` (by the soft brim, in a mitten), `hatPoint`.
 * - `mittenOnBody`: where a mitten is on the body for a lift.
 */
import { bow, INK } from '../kit';
import { scribble } from '../kit/paper';
import type { StickerPuppet } from '../kit';

/** The torso's box in rig units (designs/stickers/parts/card/manifest.json). */
const BOX = { x: 153.75, y: 385, w: 397.5, h: 260.62 };

const inks = new WeakMap<StickerPuppet, Map<string, SVGSVGElement>>();

/**
 * Markup drawn onto the card (made once per puppet and name, just above its torso; hidden until shown). Coordinates
 * are the rig's.
 */
export function ink(p: StickerPuppet, name: string, markup: string): SVGSVGElement {
  let all = inks.get(p);
  if (!all) inks.set(p, (all = new Map()));
  let svg = all.get(name);
  if (svg) return svg;
  const torso = p.partImg('torso');
  if (!torso) throw new Error(`${p.slug} has no torso to draw on`);
  const doc = torso.ownerDocument;
  svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`);
  svg.setAttribute('overflow', 'visible');
  const k = p.k;
  const [gx, gy] = [p.rig.gx, p.rig.gy];
  Object.assign(svg.style, {
    position: 'absolute', display: 'block', overflow: 'visible', visibility: 'hidden',
    left: `${((BOX.x - gx) * k).toFixed(2)}px`, top: `${((BOX.y - gy) * k).toFixed(2)}px`,
    width: `${(BOX.w * k).toFixed(2)}px`, height: `${(BOX.h * k).toFixed(2)}px`,
  });
  svg.innerHTML = markup;
  // above the torso and anything drawn there before it (props inside the torso lie over it)
  let at: Element = torso;
  while (at.nextElementSibling && at.nextElementSibling.tagName.toLowerCase() === 'svg') at = at.nextElementSibling;
  at.after(svg);
  all.set(name, svg);
  return svg;
}

/** Shows (or hides) markup drawn by `ink`; `draw` writes its strokes in (paths made with `pathLength="1"`). */
export function showInk(svg: SVGSVGElement, on: boolean, { alpha = 1, draw = 1 }: { alpha?: number; draw?: number } = {}): void {
  svg.style.visibility = on && alpha > 0.001 ? 'visible' : 'hidden';
  svg.style.opacity = alpha >= 1 ? '' : alpha.toFixed(3);
  svg.querySelectorAll<SVGPathElement>('[data-draw] path').forEach(el => {
    el.style.strokeDashoffset = (1 - Math.max(0, Math.min(1, draw))).toFixed(3);
  });
}

/** Handwriting in bold pencil: a few lines, each [y, x0, x1] on the card (rig units). */
export function handwriting(lines: readonly (readonly [number, number, number])[], seed: number, { w = 3, h = 6, op = 0.84 } = {}): string {
  const ds = lines.flatMap(([y, x0, x1], i) => scribble(x0, y, x1 - x0, seed + i * 7, h));
  return `<g stroke="${INK.graphite}" stroke-width="${w}" opacity="${op}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#sk-graphite)">${ds.map(d => `<path d="${d}"/>`).join('')}</g>`;
}

/**
 * Its card written full, the other side of the card it turns to when a story fills it: four bold lines on the printed
 * rules, round its face and its brads, joining the few words it already carries (its title, and two short lines low on
 * the right).
 */
export const WRITTEN = handwriting([
  [464, 177, 262], // beside its face
  [464, 440, 527],
  [526, 210, 496], // under its face, between the brads
  [547, 180, 382], // up to its own first line
  [589, 186, 500],
], 61);

/** The beret at rest, rig units: the pivot its transforms turn about, its middle, where a mitten takes it (the soft right side), and its thin left end. */
export const HAT = { pivot: [480, 394], middle: [426, 385], grip: [539, 407], left: [300, 372] } as const;

const rot = (dx: number, dy: number, deg: number, s: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [s * (dx * Math.cos(a) - dy * Math.sin(a)), s * (dx * Math.sin(a) + dy * Math.cos(a))];
};

/** The beret off its head: its middle at (cx, cy) (rig units, on the body), turned `deg` (clockwise), scaled `s`. */
export function hatAt(p: StickerPuppet, cx: number, cy: number, deg = 0, s = 1): void {
  const [mx, my] = rot(HAT.middle[0] - HAT.pivot[0], HAT.middle[1] - HAT.pivot[1], deg, s);
  const px = cx - mx;
  const py = cy - my;
  p.pose.decoX = px - HAT.pivot[0];
  p.pose.decoY = HAT.pivot[1] - py;
  p.pose.decoR = deg;
  p.pose.decoS = s;
}

/** Where a point of the beret (rig units as it rests on the head) is now, through this frame's decoX/decoY/decoR/decoS. */
export function hatPoint(p: StickerPuppet, ux: number, uy: number): [number, number] {
  const q = p.pose;
  const [dx, dy] = rot(ux - HAT.pivot[0], uy - HAT.pivot[1], q.decoR, q.decoS);
  return [HAT.pivot[0] + q.decoX + dx, HAT.pivot[1] - q.decoY + dy];
}

/** Where a mitten's middle is on the body, rig units, for a lift (the body's own frame: tilt and lean left out). */
export function mittenOnBody(p: StickerPuppet, side: 'L' | 'R', lift: number, at = 0.67): [number, number] {
  const a = p.rig.arms[side];
  const ang = ((side === 'L' ? 90 + lift : 90 - lift) * Math.PI) / 180;
  return [a.pivot[0] + Math.cos(ang) * a.len * at, a.pivot[1] + Math.sin(ang) * a.len * at];
}

/** The beret off its head, held by its brim (`HAT.grip`) at (gx, gy) on the body: turned `deg`, scaled `s`. */
export function hatByGrip(p: StickerPuppet, gx: number, gy: number, deg = 0, s = 1): void {
  const [dx, dy] = rot(HAT.grip[0] - HAT.middle[0], HAT.grip[1] - HAT.middle[1], deg, s);
  hatAt(p, gx - dx, gy - dy, deg, s);
}

/**
 * Its card turning over to the written side and back: on frame `fIn` the card narrows (the plain side), on the next
 * it is narrow showing the written side, then whole; on `fOut` it narrows again (written), then narrow (plain), then
 * whole. `sx` is the card's width this frame, `written` which side shows.
 */
export function turned(t: number, fIn: number, fOut: number, narrow = 0.38): { written: boolean; sx: number } {
  const f = Math.round(t * 12);
  if (f === fIn) return { written: false, sx: narrow };
  if (f === fIn + 1 || f === fOut) return { written: true, sx: narrow };
  if (f === fOut + 1) return { written: false, sx: narrow };
  return { written: f > fIn && f < fOut, sx: 1 };
}

/**
 * The kit's bow (the review's recipe: lean, the face dropping toward the foot, the beret swinging forward, eyes shut,
 * the closed smile) at a depth e from 0 to 1 given directly — for nods and bows whose depth a choreography keys frame
 * by frame on its own stop-motion poses. Returns e.
 */
export function bowBy(p: StickerPuppet, e: number, depth = 1): number {
  return e > 0 ? bow(p, Math.min(1, e), 0, 1, 1, 2, depth) : 0;
}

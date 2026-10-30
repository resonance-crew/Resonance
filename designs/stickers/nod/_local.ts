/**
 * What 聆聆's pack needs that the kit lacks.
 *
 * `written(nod, u)`: its card filling with its own handwriting, row by row and each row left to right, as it listens —
 * the rig's `torso-alt` (the same card, every rule written on) laid over the plain card and uncovered up to `u`. The kit's
 * `alt` swaps the whole card at once; this writes it in. Rows end on the card's printed rules, which both pictures share,
 * so the edge where the writing stops never shows.
 */
import type { StickerPuppet } from '../kit';

/** The torso's box in rig units (designs/stickers/parts/card/manifest.json: torso and torso-alt). */
const BOX = { x: 153.75, y: 385, w: 397.5, h: 260.62 };
/**
 * Where each row of writing ends, rig y: the card's top, then the terracotta title rule and the printed rules under
 * every row torso-alt writes on (the title row, then nine).
 */
const ROWS = [385, 424.4, 447.5, 468.1, 489.4, 510, 530.6, 551.9, 572.5, 593.1, 614.4];
/** How far along a row the writing runs, rig x (a row is written left to right between these). */
const LINE = [178, 528];

const clones = new WeakMap<StickerPuppet, HTMLImageElement>();

/** The written card over the plain one (made once per puppet, just above its torso, so props inside it lie over it). */
function writtenCard(p: StickerPuppet): HTMLImageElement {
  let im = clones.get(p);
  if (im) return im;
  const alt = p.partImg('torso-alt');
  const torso = p.partImg('torso');
  if (!alt || !torso) throw new Error(`${p.slug} has no torso-alt to write with`);
  im = alt.cloneNode() as HTMLImageElement;
  torso.after(im);
  clones.set(p, im);
  return im;
}

const X = (x: number) => (((x - BOX.x) / BOX.w) * 100).toFixed(2);
const Y = (y: number) => (((y - BOX.y) / BOX.h) * 100).toFixed(2);

/** The number of rows `written` writes (u = 1 is every one). */
export const WRITTEN_ROWS = ROWS.length - 1;

/**
 * 聆聆's card written on up to `u` (0 → nothing beyond its own few words, 1 → every row): rows top to bottom, each left
 * to right. `alpha` fades the writing (it is drawn over the card, so a fade keeps the die-cut).
 */
export function written(p: StickerPuppet, u: number, alpha = 1): void {
  const im = writtenCard(p);
  const r = Math.max(0, Math.min(1, u)) * WRITTEN_ROWS;
  if (r <= 0.001 || alpha <= 0.001) {
    im.style.visibility = 'hidden';
    return;
  }
  im.style.visibility = 'visible';
  im.style.opacity = alpha >= 1 ? '' : alpha.toFixed(3);
  const i = Math.min(WRITTEN_ROWS - 1, Math.floor(r + 1e-6));
  const frac = r - i;
  const top = ROWS[i];
  const bottom = ROWS[i + 1];
  const xc = frac >= 0.999 ? 100 : Number(X(LINE[0] + (LINE[1] - LINE[0]) * frac));
  im.style.clipPath = `polygon(0% 0%, 100% 0%, 100% ${Y(top)}%, ${xc}% ${Y(top)}%, ${xc}% ${Y(bottom)}%, 0% ${Y(bottom)}%)`;
}

/** The beret at rest, rig units: the pivot its transforms turn about, its middle, where a mitten takes it (the right, soft side), and its thin left end. */
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

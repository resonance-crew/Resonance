/**
 * What 點點's pack needs that the kit doesn't have (kept here, not in the kit: the packs are drawn side by side): a
 * stop-motion value helper, and props drawn in the kit's paper and registered under `pip-` kinds for this pack's
 * stickers alone (each sticker is bundled on its own, so nothing here reaches another pack).
 */
import { PROP_KINDS, type PropKind, type PropState } from '../kit';
import { F, INK, path, pencil, poly, tear, type Pt } from '../kit/paper';
import { clamp } from '../../../src/lib/mascots/geometry';

/**
 * Stop-motion values: the value of the latest key at or before t (held until the next — no in-betweens). Drive a pose
 * field with it on the body's frames, and each listed frame is exactly its pose.
 */
export function pick(t: number, frames: readonly (readonly [number, number])[]): number {
  let v = frames[0]?.[1] ?? 0;
  for (const [at, val] of frames) {
    if (at <= t + 1e-6) v = val;
    else break;
  }
  return v;
}

/** The kit's prop contract (props.ts `KindDef`): a box in rig units, named anchors, a drawing, a state. */
interface LocalKind {
  size: readonly [number, number];
  anchors: Record<string, Pt>;
  draw(seed: number): string;
  update?(svg: SVGSVGElement, s: PropState, seed: number): void;
}

const DEG = Math.PI / 180;
const paper = (d: string, fill: string, filter = 'paper') => `<path d="${d}" fill="${fill}" filter="url(#${F}${filter})"/>`;

function starPts(cx: number, cy: number, r1: number, r2: number, n = 5, rot = -90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (rot + (i * 180) / n) * DEG;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function register(name: string, def: LocalKind): PropKind {
  (PROP_KINDS as unknown as Record<string, LocalKind>)[name] = def;
  return name as PropKind;
}

/**
 * A paper star on a wooden stick (a gold star for a story well written, held up high — 點點's arms are too short to
 * hold the kit's star clear of its own paper): the kit's star (butter, a paler middle) and `shine` 0–1 its gold strokes.
 */
export const STAR_WAND = register('pip-star-wand', {
  size: [132, 250],
  anchors: { center: [66, 66], star: [66, 66], grip: [66, 206] },
  draw(seed) {
    const stick = tear(poly([[62.5, 96], [69.5, 96], [69.5, 244], [62.5, 244]], 5), seed, { jag: 0.3, wander: 0.6 });
    const star = tear(poly(starPts(66, 66, 50, 22), 5), seed + 1, { jag: 0.6, wander: 1.6 });
    const inner = poly(starPts(66, 66, 30, 13), 5);
    const rays = Array.from({ length: 5 }, (_, i) => {
      const a = (-90 + 36 + i * 72) * DEG;
      return pencil([[66 + Math.cos(a) * 40, 66 + Math.sin(a) * 40], [66 + Math.cos(a) * 60, 66 + Math.sin(a) * 60]], seed + 5 + i, 1, 0.3)[0];
    });
    return `<g class="sh" stroke="${INK.gold}" stroke-width="5" opacity="0.95" fill="none" stroke-linecap="round" filter="url(#${F}crayon)">${
      rays.map(d => `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join('')}</g>
      ${paper(path(stick), INK.wood, 'cut')}
      ${paper(path(star), INK.butter)}
      <path d="${path(inner)}" fill="${INK.goldLight}" opacity="0.7"/>`;
  },
  update(svg, s) {
    svg.querySelectorAll<SVGPathElement>('.sh path').forEach(p => {
      p.style.strokeDashoffset = (1 - clamp(s.shine ?? 0, 0, 1)).toFixed(3);
    });
  },
});

/**
 * Shake marks: two short terracotta crayon arcs, a bracket ")" beside something shaking (a laugh) — the comic
 * strip's vibration lines, in the props' crayon. Drawn facing right (put the left one at `rot: 180`); `draw` 0–1.
 */
export const SHAKE = register('pip-shake', {
  size: [64, 120],
  anchors: { center: [10, 60], inner: [10, 60] },
  draw(seed) {
    const arcs = [30, 50].map((r, i) => {
      const pts: Pt[] = [];
      const span = i ? 34 : 40;
      for (let a = -span; a <= span; a += 8) pts.push([Math.cos(a * DEG) * r, 60 + Math.sin(a * DEG) * r]);
      return pencil(pts, seed + i, 1, 0.5)[0];
    });
    return `<g class="sk" stroke="${INK.terracotta}" stroke-width="6" opacity="0.95" fill="none" stroke-linecap="round" filter="url(#${F}crayon)">${
      arcs.map(d => `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join('')}</g>`;
  },
  update(svg, s) {
    svg.querySelectorAll<SVGPathElement>('.sk path').forEach((p, i) => {
      p.style.strokeDashoffset = (1 - clamp((s.draw ?? 1) * 1.6 - i * 0.6, 0, 1)).toFixed(3);
    });
  },
});

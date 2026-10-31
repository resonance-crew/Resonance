/**
 * What 點點's pack needs that the kit doesn't have (kept here, not in the kit: the packs are drawn side by side): a
 * stop-motion value helper, and props drawn in the kit's paper and registered under `pip-` kinds for this pack's
 * stickers alone (each sticker is bundled on its own, so nothing here reaches another pack).
 */
import { PROP_KINDS, type PropKind, type PropState, type StickerPuppet } from '../kit';
import { F, INK, path, pencil, poly, scribble, smoothPath, tear, type Pt } from '../kit/paper';
import { wavyPoints } from '../../../src/lib/design/wavyPath';
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
/** Strokes drawn in: every path under `sel` shown up to u of its length (paths carry pathLength 1). */
function drawIn(svg: SVGSVGElement, sel: string, u: number): void {
  svg.querySelectorAll<SVGPathElement>(`${sel} path`).forEach(p => {
    p.style.strokeDashoffset = (1 - clamp(u, 0, 1)).toFixed(3);
  });
}
const crayon = (ds: string[], color: string, w: number, cls: string) =>
  `<g class="${cls}" stroke="${color}" stroke-width="${w}" opacity="0.95" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${F}crayon)">${
    ds.map(d => `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join('')}</g>`;

function register(name: string, def: LocalKind): PropKind {
  (PROP_KINDS as unknown as Record<string, LocalKind>)[name] = def;
  return name as PropKind;
}

/**
 * A story card marked by a teacher: cream, three bold handwritten lines, and `draw` 0–1 drawing a red crayon double
 * circle by the first (the 圈圈 a teacher draws by a line that's well written: two loose loops, a pen going round
 * twice — never the stamped ring of 牽牽's 好喔). Held by its lower edge (`bottom`, or the corners `gripL` / `gripR`).
 */
export const PRAISE_CARD = register('pip-praise-card', {
  size: [150, 112],
  anchors: { center: [75, 56], gripL: [16, 98], gripR: [134, 98], bottom: [75, 100] },
  draw(seed) {
    const card = tear(poly([[8, 8], [142, 6], [144, 102], [6, 104]], 5), seed, { jag: 0.35, wander: 1 });
    const lines = [[38, 72], [62, 98], [84, 64]].flatMap(([y, w], i) => scribble(16, y, w, seed + 30 + i, 4.4));
    // the double circle at the first line's end: two loops round the same middle, not quite closed
    const loop = (r: number, a0: number, a1: number, s: number) => {
      const pts: Pt[] = [];
      for (let a = a0; a <= a1; a += 12) pts.push([116 + Math.cos(a * DEG) * r * 1.08, 36 + Math.sin(a * DEG) * r + Math.sin(a * DEG * 3 + s) * 0.9]);
      return smoothPath(pts);
    };
    return `${paper(path(card), INK.paper, 'cut')}
      <path d="M14,16 L136,14" stroke="${INK.terracotta}" stroke-width="2.6" opacity="0.7" filter="url(#${F}graphite)"/>
      <g stroke="${INK.graphite}" stroke-width="3" opacity="0.78" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${F}graphite)">${lines.map(d => `<path d="${d}"/>`).join('')}</g>
      ${crayon([loop(21, -240, 110, seed), loop(15, -210, 140, seed + 2)], INK.red, 4.6, 'c')}`;
  },
  update(svg, s) {
    const u = clamp(s.draw ?? 0, 0, 1);
    svg.querySelectorAll<SVGPathElement>('.c path').forEach((p, i) => {
      p.style.strokeDashoffset = (1 - clamp(u * 2 - i, 0, 1)).toFixed(3);
    });
  },
});

/**
 * A wide-open laughing mouth for 點點 (its rig's `mouth-open` is a small one): the same graphite, a terracotta tongue.
 * Laid over its mouth, inside its face (`inside: { above: 'mouth-open' }`); `show` 0–1 how wide (a laugh flaps it).
 */
export const LAUGH_MOUTH = register('pip-laugh-mouth', {
  size: [40, 30],
  anchors: { center: [20, 10] },
  draw() {
    return `<g class="m"><path d="M4,5 Q20,8 36,4 Q34,24 20,25 Q6,24 4,5Z" fill="${INK.graphite}" opacity="0.92" filter="url(#${F}graphite)"/>
      <path d="M11,20 Q20,14 29,20 Q26,24.5 20,24.6 Q14,24.5 11,20Z" fill="oklch(62% 0.12 30)" opacity="0.9"/></g>`;
  },
  update(svg, s) {
    const g = svg.querySelector<SVGGElement>('.m');
    if (!g) return;
    g.style.transformBox = 'view-box';
    g.style.transformOrigin = '20px 5px';
    g.style.transform = `scale(1,${(0.55 + 0.45 * clamp(s.show ?? 1, 0, 1)).toFixed(3)})`;
  },
});

/**
 * Laugh marks: three short terracotta crayon arcs, like the arcs of a bouncing ball, beside a laugh; `phase` (cycles)
 * bounces each up and down in turn, `draw` 0–1 shows them. Drawn for the right side (put the left one at `sx: -1`).
 */
export const LAUGH_MARKS = register('pip-laugh-marks', {
  size: [80, 110],
  anchors: { center: [16, 55], inner: [6, 55] },
  draw(seed) {
    const arcs = [[18, 26, 16], [40, 52, 14], [20, 82, 12]].map(([x, y, r], i) => {
      const pts: Pt[] = [];
      for (let a = 200; a <= 340; a += 14) pts.push([x + Math.cos(a * DEG) * r, y + Math.sin(a * DEG) * r * 0.8]);
      return `<g class="a a${i}">${crayon([pencil(pts, seed + i, 1, 0.4)[0]], INK.terracotta, 5.5, 'd')}</g>`;
    });
    return arcs.join('');
  },
  update(svg, s) {
    drawIn(svg, '.d', s.draw ?? 1);
    const ph = (s.phase ?? 0) * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const g = svg.querySelector<SVGGElement>(`.a${i}`);
      if (g) g.setAttribute('transform', `translate(0 ${(-7 * Math.abs(Math.sin(ph + i * 2.1))).toFixed(1)})`);
    }
  },
});

/** The low wall's size, rig units, and where its wave's middle runs (y). */
const LOW_WALL: readonly [number, number] = [330, 66];
const LOW_WALL_TOP = 14;
/** 牽牽's wall paper (twine/_local.ts): the brand's terracotta, a step softer, a mid tone on either paper. */
const WALL_INK = 'oklch(70% 0.1 45)';

/**
 * A small, low wall lying along the sticker's foot, for 點點 to rise out from behind (it is clipped below the wall's top,
 * `clipBelow`): 牽牽's wall from 在嗎？ laid down — a strip of the brand's terracotta paper whose top edge is the brand's
 * wave (`wavyPoints`, the landing page's section edge), its bottom straight, a pencil line along the wave. `top` is the
 * wave's middle, `base` the foot.
 */
export const LOW_WALL_KIND = register('pip-low-wall', {
  size: LOW_WALL,
  anchors: { center: [165, 40], top: [165, LOW_WALL_TOP], base: [165, 60] },
  draw(seed) {
    const [w, h] = LOW_WALL;
    const pts = wavyPoints(w - 20, 0, 6, seed, 5);
    // the section edge's cubic between two points, its handles level at the half-way x
    const wave: Pt[] = [];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      for (let j = i === 1 ? 0 : 1; j <= 8; j++) {
        const u = j / 8;
        const v = 1 - u;
        wave.push([10 + v * v * v * x0 + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * x1, LOW_WALL_TOP + v * v * v * y0 + 3 * v * v * u * y0 + 3 * v * u * u * y1 + u * u * u * y1]);
      }
    }
    // the straight foot, sampled (so it tears like the rest), right to left
    const n = Math.round((w - 20) / 14);
    const foot: Pt[] = Array.from({ length: n + 1 }, (_, i) => [w - 10 - ((w - 20) * i) / n, h - 6 + (2 * i) / n] as Pt);
    const edge = smoothPath(wave.map(([x, y]) => [x, y + 7] as Pt));
    return `<path d="${path(tear([...wave, ...foot], seed, { amp: 1.2, jag: 0.6, wander: 2 }))}" fill="${WALL_INK}" filter="url(#${F}paper)"/>
      <path d="${edge}" stroke="oklch(58% 0.11 42)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#${F}graphite)"/>`;
  },
});

/**
 * Clips a puppet below a line across the sticker (px): nothing of it under y is drawn — 點點 rising out from behind
 * its low wall (the line inside the wall, under the wave's deepest dip). Call it last in a frame (it reads the pose's rise); the clip is in the puppet's own coordinates, whose origin is
 * its ground point lifted by its rise.
 */
export function clipBelow(p: StickerPuppet, y: number): void {
  const oy = y - (p.y - p.pose.rise * p.k);
  p.el.style.clipPath = `polygon(-2000px -2000px, 2000px -2000px, 2000px ${oy.toFixed(1)}px, -2000px ${oy.toFixed(1)}px)`;
}

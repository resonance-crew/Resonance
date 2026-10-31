/**
 * 牽牽's own helpers for its pack (the kit stays shared: four packs are drawn at once).
 *
 * `perk`: its bow is an emotion meter (designs/mascots/round3/tag/proposal.md) — the two loops perk up when it is happy
 * and droop when it is shy, the knot staying put in the middle. The rig has one bow picture, so this cuts it in three
 * along its knot (the left loop with its tail, the right loop with its tail, and the knot with the string through it),
 * each a copy of the bow's own <img> clipped to its piece: the loops turn about the knot, the knot never moves, so the
 * bow stays centred and level whatever it feels (the proposal: it must never come to rest leaning to one side).
 *
 * `mittenAt` / `between`: where a mitten is drawn through the body's lean too, for a prop held in one or both.
 *
 * `ripples` (RIPPLES_KIND): a prop kind for 共振了 — the brand's resonance drawn soft, ")))" and "(((" meeting — added
 * to the kit's PROP_KINDS when this file loads (only in the stickers that import it), drawn with the kit's own paper.
 *
 * `wall` (WALL_KIND) and `cutLeftOf`: a thin wall at the sticker's left whose edge is the brand's wave, for 在嗎？ to
 * peek out from; and the cut that keeps whatever of 牽牽 is behind it from reaching past its far side.
 */
import { clamp, type StickerPuppet } from '../kit';
import { wavyPoints } from '../../../src/lib/design/wavyPath';
import { F, path, smoothPath, tear, type Pt } from '../kit/paper';
import { PROP_KINDS, type PropKind, type PropState } from '../kit/props';

/** How far a loop turns at perk ±1, degrees. */
const PERK_DEG = 16;
/**
 * The bow picture (parts/tag deco: rig box x 276.25–428.75, y 127.5–206.25, its knot at 350, 152), in % of its box:
 * the knot's split, and the knot with the string running up out of it and down to the eyelet.
 */
const SPLIT = (((350 - 276.25) / 152.5) * 100).toFixed(2);
const KNOT = 'polygon(40.5% 0%, 56% 0%, 56% 47%, 51.5% 47%, 51.5% 100%, 44.5% 100%, 44.5% 47%, 40.5% 47%)';
/**
 * Each loop with its tail: its side of the knot, reaching in under the knot (which covers the cut) but leaving out the
 * string above the knot and the strand below it, which would otherwise swing out from under the knot as the loops turn.
 */
const LEFT = `polygon(0% 0%, 44% 0%, 44% 14%, ${SPLIT}% 14%, ${SPLIT}% 47%, 44% 47%, 44% 100%, 0% 100%)`;
const RIGHT = `polygon(53% 0%, 100% 0%, 100% 100%, 52% 100%, 52% 47%, ${SPLIT}% 47%, ${SPLIT}% 14%, 53% 14%)`;

interface Bow {
  deco: HTMLImageElement;
  left: HTMLImageElement;
  right: HTMLImageElement;
  knot: HTMLImageElement;
  v: number;
}
const bows = new WeakMap<StickerPuppet, Bow>();

/**
 * The bow's loops this frame: +1 perked up (happy), −1 drooping (shy), 0 as drawn. Call it every frame of a sticker
 * that uses it (each call adds; the frame after starts again from 0) — from the first frame, so the key pose is drawn
 * the same way at t = 0 and t = duration.
 */
export function perk(p: StickerPuppet, v: number): void {
  let bow = bows.get(p);
  if (!bow) {
    const deco = p.partImg('deco');
    if (!deco) throw new Error(`${p.slug} has no deco to perk`);
    const copy = (clip: string) => {
      const im = deco.cloneNode() as HTMLImageElement;
      im.style.clipPath = clip;
      return im;
    };
    const left = copy(LEFT);
    const right = copy(RIGHT);
    const knot = copy(KNOT);
    // the loops, then the knot over where they meet
    deco.after(left, right, knot);
    const made: Bow = { deco, left, right, knot, v: 0 };
    bow = made;
    bows.set(p, made);
    const draw = p.render.bind(p);
    p.render = () => {
      draw();
      const tf = made.deco.style.transform;
      const vis = made.deco.style.visibility;
      const a = PERK_DEG * clamp(made.v, -1.3, 1.3);
      made.left.style.transform = `${tf} rotate(${a.toFixed(2)}deg)`;
      made.right.style.transform = `${tf} rotate(${(-a).toFixed(2)}deg)`;
      made.knot.style.transform = tf;
      for (const im of [made.left, made.right, made.knot]) im.style.visibility = vis;
      made.deco.style.visibility = 'hidden';
      made.v = 0;
    };
  }
  bow.v += v;
}

/**
 * Where a mitten is drawn, px — `at` of the way along the arm (MITTEN_MIDDLE, where it holds things) — through the
 * body's whole pose, its lean too (the kit's `mitten()` leaves the lean's foreshortening out, so in a bow a prop held
 * there would drop below the mittens).
 */
export function mittenAt(p: StickerPuppet, side: 'L' | 'R', at = 0.67): [number, number] {
  const arm = p.rig.arms[side];
  const lift = p.lift(side);
  const a = ((side === 'L' ? 90 + lift : 90 - lift) * Math.PI) / 180;
  const r = arm.len * at;
  return p.pagePoint(arm.pivot[0] + Math.cos(a) * r, arm.pivot[1] + Math.sin(a) * r);
}

/** Between both mittens (a cup or a stem held in the two), px. */
export function between(p: StickerPuppet, at = 0.67): [number, number] {
  const [lx, ly] = mittenAt(p, 'L', at);
  const [rx, ry] = mittenAt(p, 'R', at);
  return [(lx + rx) / 2, (ly + ry) / 2];
}

/** A prop kind as the kit's PROP_KINDS holds one (props.ts keeps its own type to itself). */
interface LocalKind {
  size: readonly [number, number];
  anchors: Record<string, Pt>;
  draw(seed: number): string;
  update?(svg: SVGSVGElement, s: PropState, seed: number): void;
}

/** One soft paper crescent: an arc of radius r about (cx, cy), `half` degrees either side of `dir`, `w` wide. */
function crescent(cx: number, cy: number, r: number, dir: number, half: number, w: number): Pt[] {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = ((dir - half + 2 * half * u) * Math.PI) / 180;
    // fuller in the middle, tapering to soft points at both ends
    const t = w * (0.25 + 0.75 * Math.sin(Math.PI * u));
    outer.push([cx + Math.cos(a) * (r + t / 2), cy + Math.sin(a) * (r + t / 2)]);
    inner.push([cx + Math.cos(a) * (r - t / 2), cy + Math.sin(a) * (r - t / 2)]);
  }
  return [...outer, ...inner.reverse()];
}

/** The ripples' arcs: three from each side, the innermost first. */
const RIPPLE_R = [40, 63, 86] as const;
const RIPPLE_SIZE: readonly [number, number] = [260, 150];
const RIPPLE_L: Pt = [16, 75];
const RIPPLE_R_AT: Pt = [244, 75];
/** 牽牽's ripples in its blue, 聆聆's in its lavender (both a step deeper than their papers, so they read on either). */
const RIPPLE_INK = ['oklch(66% 0.065 228)', 'oklch(64% 0.09 292)'] as const;

/**
 * `ripples`: the brand's resonance drawn soft — three paper crescents spreading from each of two friends, ")))" from the
 * left and "(((" from the right, meeting in the middle (`center`), where a heart can grow. `show` 0–1 grows them, the
 * innermost first and the left a little before the right; `pulse` 0–1 runs one ripple out through both sets toward the
 * middle; `lead` (0–1) how far the left set runs ahead of the right on a pulse.
 */
const RIPPLES: LocalKind = {
  size: RIPPLE_SIZE,
  anchors: { center: [130, 75], left: RIPPLE_L, right: RIPPLE_R_AT },
  draw(seed) {
    const sets = [[RIPPLE_L, 0, 'L'], [RIPPLE_R_AT, 180, 'R']] as const;
    return sets.map(([[cx, cy], dir, side], s) => RIPPLE_R.map((r, i) => {
      const pts = tear(crescent(cx, cy, r, dir, 38 - i * 4, 13 - i), seed + s * 10 + i, { amp: 1, jag: 0.5, wander: 0.8 });
      return `<g class="r${side}${i}"><path d="${path(pts)}" fill="${RIPPLE_INK[s]}" filter="url(#${F}thin)"/></g>`;
    }).join('')).join('');
  },
  update(svg, s) {
    const show = clamp(s.show ?? 1, 0, 1);
    const ph = s.pulse ?? 0;
    const lead = 0.12;
    for (const [side, cx, late] of [['L', RIPPLE_L[0], 0], ['R', RIPPLE_R_AT[0], lead]] as const) {
      RIPPLE_R.forEach((r, i) => {
        const g = svg.querySelector<SVGGElement>(`.r${side}${i}`);
        if (!g) return;
        const grow = clamp((show - late * 0.5) * 1.6 - i * 0.3, 0, 1);
        const u = clamp((ph - late) * 1.25 - i * 0.2, 0, 1);
        const v = Math.sin(Math.PI * u);
        const sc = grow * grow * (3 - 2 * grow);
        // each crescent swells as the ripple passes it, about its own arc (so it stays on its ring)
        const mx = side === 'L' ? cx + r : cx - r;
        g.style.transformBox = 'view-box';
        g.style.transformOrigin = `${mx}px ${RIPPLE_L[1]}px`;
        g.style.transform = `scale(${(sc * (1 + 0.28 * v)).toFixed(3)},${(sc * (1 + 0.16 * v)).toFixed(3)})`;
        g.style.visibility = sc <= 0.001 ? 'hidden' : '';
      });
    }
  },
};
(PROP_KINDS as unknown as Record<string, LocalKind>).ripples = RIPPLES;
/** The `ripples` kind, for a sticker's props (registered when this file loads). */
export const RIPPLES_KIND = 'ripples' as PropKind;

/**
 * The brand's wave stood on end (the landing page's section edge: `wavyPoints` joined by `pointsToBezier`, in
 * src/lib/design/wavyPath.ts), sampled into points: x = 0 at both ends, swinging ±`amp` between, `steps` turns down a
 * height of `h`.
 */
function brandWave(h: number, amp: number, seed: number, steps: number): Pt[] {
  const pts = wavyPoints(h, 0, amp, seed, steps);
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    // the section edge's cubic between two points, its handles level (here: upright) at the half-way height
    const [y0, x0] = pts[i - 1];
    const [y1, x1] = pts[i];
    const my = (y0 + y1) / 2;
    for (let j = i === 1 ? 0 : 1; j <= 8; j++) {
      const u = j / 8;
      const v = 1 - u;
      const x = v * v * v * x0 + 3 * v * v * u * x0 + 3 * v * u * u * x1 + u * u * u * x1;
      const y = v * v * v * y0 + 3 * v * v * u * my + 3 * v * u * u * my + u * u * u * y1;
      out.push([x, y]);
    }
  }
  return out;
}

const WALL_SIZE: readonly [number, number] = [96, 660];
/** A wall's paper: the brand's terracotta, a step softer, a mid tone on either paper. */
const WALL_INK = 'oklch(70% 0.1 45)';

/**
 * `wall`: a long, thin wall standing at the sticker's left, its right edge the brand's wave — something to peek out
 * from. A strip of the brand's terracotta paper (its left edge straight, its right edge the wave), a pencil line along
 * the wave as the landing page's edges carry. `right` is the wave's middle (where its edge runs), `base` its foot.
 */
const WALL: LocalKind = {
  size: WALL_SIZE,
  anchors: { center: [48, 330], base: [40, 652], top: [40, 8], right: [70, 330] },
  draw(seed) {
    const [, h] = WALL_SIZE;
    const wave = brandWave(h - 16, 15, seed, 5).map(([x, y]) => [70 + x, 8 + y] as Pt);
    // the straight side, sampled (so it tears like the rest), from the foot up
    const n = Math.round((h - 18) / 14);
    const left: Pt[] = Array.from({ length: n + 1 }, (_, i) => [12 - (2 * i) / n, h - 8 - ((h - 18) * i) / n] as Pt);
    const strip: Pt[] = [...wave, ...left];
    const edge = smoothPath(wave.map(([x, y]) => [x - 7, y] as Pt));
    return `<path d="${path(tear(strip, seed, { amp: 1.2, jag: 0.6, wander: 2 }))}" fill="${WALL_INK}" filter="url(#${F}paper)"/>
      <path d="${edge}" stroke="oklch(58% 0.11 42)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#${F}graphite)"/>`;
  },
};
(PROP_KINDS as unknown as Record<string, LocalKind>).wall = WALL;
/** The `wall` kind, for a sticker's props (registered when this file loads). */
export const WALL_KIND = 'wall' as PropKind;

/**
 * Cuts a puppet off left of a line on the sticker (px), as a wall it stands behind would: whatever of it reaches past
 * the wall's far side isn't there (and, with `below`, whatever is under the wall's foot). Call it every frame, after its
 * pose and place are set.
 */
export function cutLeftOf(p: StickerPuppet, x: number, below?: { y: number; right: number }): void {
  const ox = p.x;
  const oy = p.y - p.pose.rise * p.k;
  const pt = (px: number, py: number) => `${(px - ox).toFixed(1)}px ${(py - oy).toFixed(1)}px`;
  // …and, behind the wall's foot (left of `right`), nothing under `y` either
  const foot = below ? [pt(below.right, 4000), pt(below.right, below.y), pt(x, below.y)] : [pt(x, 4000)];
  p.el.style.clipPath = `polygon(${[pt(x, -4000), pt(4000, -4000), pt(4000, 4000), ...foot].join(', ')})`;
}

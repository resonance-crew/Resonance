/**
 * Props for the stickers, in the series' paper: torn or cut paper with its fibre rim and glue shadow, graphite pencil,
 * crayon; cream, terracotta and the cast's own colours. Each is drawn by seeded generator code in rig units (the cast's
 * units: 摺摺 is 420 tall, a mitten about 63 across) and placed at its puppet's px per unit, so it is the same paper at
 * the same size as the characters.
 *
 * Every prop has a size (its drawing's box), named anchors (`center`, and where a mitten holds it: `grip`), and maybe
 * a state a choreography sets each frame (`prop.set({ glow: 0.7 })`). Show and hide things that stick out past the
 * puppets by scale, not opacity: the die-cut margin follows what is solid, so a half-faded prop loses its outline
 * (opacity is fine for anything drawn over a puppet or another prop).
 */
import { clamp, smooth } from '../../../src/lib/mascots/geometry';
import { ellipse, F, INK, path, pencil, poly, rng, scribble, smoothPath, spline, tear, type Pt } from './paper';

export type PropKind =
  | 'heart' | 'note' | 'cup' | 'flower' | 'slip' | 'stamp' | 'pennant' | 'star' | 'card' | 'confetti' | 'wave' | 'tear'
  | 'lantern' | 'sun' | 'burst' | 'sparkle' | 'sparkles' | 'strokes' | 'zz' | 'scribble' | 'underline' | 'panel' | 'ground';

/** What a prop's state may say (each kind reads its own keys; anything else is ignored). */
export type PropState = Partial<Record<
  | 'glow' | 'warm' | 'heart' | 'steam' | 'phase' | 'seal' | 'wave' | 'shine' | 'lines' | 'underline' | 't' | 'show'
  | 'pulse' | 'glint' | 'rays' | 'draw',
  number
>>;

interface KindDef {
  /** Its drawing's box, rig units. */
  size: readonly [number, number];
  anchors: Record<string, Pt>;
  draw(seed: number): string;
  update?(svg: SVGSVGElement, s: PropState, seed: number): void;
}

const f1 = (n: number) => n.toFixed(1);
const DEG = Math.PI / 180;
const paper = (d: string, fill: string, filter = 'paper', extra = '') => `<path d="${d}" fill="${fill}" filter="url(#${F}${filter})"${extra}/>`;
interface PencilOpts {
  w?: number;
  op?: number;
  color?: string;
  cls?: string;
  dash?: boolean;
}
const pencilG = (ds: string[], { w = 1.6, op = 0.7, color = INK.graphite as string, cls = '', dash = false }: PencilOpts = {}) =>
  `<g${cls ? ` class="${cls}"` : ''} stroke="${color}" stroke-width="${w}" opacity="${op}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${F}graphite)">${
    ds.map(d => `<path d="${d}"${dash ? ' pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"' : ''}/>`).join('')}</g>`;
/** Scale a class of groups about their own centre. */
function scaleAll(svg: SVGSVGElement, sel: string, s: number): void {
  svg.querySelectorAll<SVGGElement>(sel).forEach(g => {
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center';
    g.style.transform = `scale(${Math.max(0, s).toFixed(3)})`;
    g.style.visibility = s <= 0.001 ? 'hidden' : '';
  });
}
/** Draw strokes in: every path under `sel` (with pathLength 1) shown up to u of its length. */
function drawIn(svg: SVGSVGElement, sel: string, u: number): void {
  svg.querySelectorAll<SVGPathElement>(`${sel} path`).forEach(p => {
    p.style.strokeDashoffset = (1 - clamp(u, 0, 1)).toFixed(3);
  });
}

function heartPts(cx: number, cy: number, w: number, n = 64): Pt[] {
  const s = w / 32;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + 16 * Math.sin(t) ** 3 * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]);
  }
  return out;
}
function starPts(cx: number, cy: number, r1: number, r2: number, n = 5, rot = -90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (rot + (i * 180) / n) * DEG;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
/** A soft-pointed star (Hush's twinkles, a sparkle): concave sides. */
function twinklePts(cx: number, cy: number, r: number, waist = 0.28, n = 4): Pt[] {
  const keys: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * waist : r;
    const a = (-90 + (i * 180) / n) * DEG;
    keys.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return spline(keys, 3);
}
/** A ribbon of width w along a polyline. */
function ribbon(line: readonly Pt[], w: number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    left.push([p[0] + (nx * w) / 2, p[1] + (ny * w) / 2]);
    right.push([p[0] - (nx * w) / 2, p[1] - (ny * w) / 2]);
  });
  return [...left, ...right.reverse()];
}

/** How much larger a `sparkle` is drawn where it is the point of the sticker (`scale: SPARKLE_BIG`): 1.5–1.8×. */
export const SPARKLE_BIG = 1.65;

/** The cast's papers, for confetti and anything that wants the whole family in it. */
export const CAST_COLOURS = [INK.terracotta, INK.butter, INK.sage, INK.mist, INK.lavender, INK.gold, INK.midnight] as const;

const CONFETTI_N = 28;
interface Bit {
  vx: number;
  vy: number;
  spin: number;
  sway: number;
  life0: number;
  life1: number;
}
function confettiBits(seed: number): Bit[] {
  const r = rng(seed + 900);
  return Array.from({ length: CONFETTI_N }, (_, i) => {
    const a = (-90 + (r() - 0.5) * 150) * DEG;
    const v = 170 + r() * 190;
    return {
      vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (r() - 0.5) * 900, sway: 6 + r() * 14,
      life0: (i % 4) * 0.04 + r() * 0.05, life1: 0.7 + r() * 0.3,
    };
  });
}

export const PROP_KINDS: Record<PropKind, KindDef> = {
  /**
   * A paper heart; `glow` 0–1 lays warm paper halos behind it and a few crayon rays (to the sides, never up), `warm`
   * (default: glow) warms the heart's own red. `heart: 0` draws the glow alone — to put the glow behind a puppet's
   * face and arms (a prop inside it) and the heart itself in front of them (a second heart prop, `glow: 0`).
   */
  heart: {
    size: [240, 220],
    anchors: { center: [120, 110], top: [120, 62], bottom: [120, 162] },
    draw(seed) {
      const halo2 = paper(path(tear(heartPts(120, 110, 200), seed + 1, { jag: 1.4, wander: 6 })), INK.goldPale, 'thin');
      const halo1 = paper(path(tear(heartPts(120, 110, 160), seed + 2, { jag: 1.2, wander: 5 })), INK.goldLight, 'thin');
      // rays out to the sides and below (never up into a face behind it)
      const rays = [-28, -2, 24, 156, 182, 208].map((deg, i) => {
        const a = deg * DEG;
        const r0 = 102;
        const r1 = 124 - (i % 2) * 8;
        return pencil([[120 + Math.cos(a) * r0, 110 + Math.sin(a) * r0], [120 + Math.cos(a) * r1, 110 + Math.sin(a) * r1]], seed + 10 + i, 1, 0.4)[0];
      });
      const heart = tear(heartPts(120, 110, 116), seed + 3, { jag: 1.1, wander: 5 });
      const hi = pencil([[87, 88], [93, 76], [105, 72]], seed + 4, 2, 0.8);
      return `<g class="h2">${halo2}</g><g class="h1">${halo1}</g>
        ${pencilG(rays, { w: 5.5, op: 0.9, color: INK.terracotta, cls: 'r', dash: true }).replace(`filter="url(#${F}graphite)"`, `filter="url(#${F}crayon)"`)}
        <g class="hp">${paper(path(heart), INK.red)}
        <path class="warm" d="${path(heart)}" fill="${INK.goldLight}" opacity="0"/>
        <g stroke="oklch(75% 0.12 40)" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.65" filter="url(#${F}crayon)">${hi.map(d => `<path d="${d}"/>`).join('')}</g></g>`;
    },
    update(svg, s) {
      const g = clamp(s.glow ?? 0, 0, 1);
      scaleAll(svg, '.h2', g > 0 ? 0.62 + 0.38 * smooth(g) : 0);
      scaleAll(svg, '.h1', g > 0 ? 0.76 + 0.24 * smooth(g) : 0);
      drawIn(svg, '.r', smooth((g - 0.55) / 0.45));
      const warm = svg.querySelector<SVGPathElement>('.warm');
      if (warm) warm.style.opacity = (0.32 * clamp(s.warm ?? g, 0, 1)).toFixed(3);
      const hp = svg.querySelector<SVGGElement>('.hp');
      if (hp) hp.style.visibility = (s.heart ?? 1) > 0 ? '' : 'hidden';
    },
  },

  /** A small folded note: a letter folded in thirds, its flap's V, a terracotta dot sealing it. */
  note: {
    size: [104, 78],
    anchors: { center: [52, 39], grip: [22, 52], corner: [92, 18] },
    draw(seed) {
      const body = tear(poly([[8, 12], [96, 8], [98, 66], [6, 70]], 5), seed, { jag: 0.5, wander: 1.6 });
      const fold = pencil([[9, 14], [52, 42], [95, 10]], seed + 1, 2, 0.5);
      const crease = pencil([[10, 52], [96, 49]], seed + 2, 1, 0.4);
      return `${paper(path(body), INK.paper, 'cut')}
        ${pencilG(crease, { w: 1.2, op: 0.25 })}
        <path d="M9,14 L52,42 L95,10 Z" fill="oklch(91% 0.025 86)" opacity="0.7"/>
        ${pencilG(fold, { w: 1.6, op: 0.55 })}
        ${paper(path(tear(ellipse(52, 42, 8.5, 8.5, 18), seed + 3, { jag: 0.6, wander: 1 })), INK.terracotta, 'thin')}`;
    },
  },

  /** A paper cup (cream, a terracotta sleeve) and its steam: `steam` 0–1 how much, `phase` (cycles) where it is in its rise. */
  cup: {
    size: [110, 196],
    anchors: { center: [55, 150], grip: [55, 150], top: [55, 104] },
    draw(seed) {
      const cup = tear(poly([[22, 104], [88, 104], [79, 182], [31, 182]], 5), seed, { jag: 0.5, wander: 1.4 });
      const sleeve = tear(poly([[25, 128], [85, 128], [82, 154], [28, 154]], 5), seed + 1, { jag: 0.6, wander: 1.2 });
      const rim = tear(poly([[18, 98], [92, 98], [92, 108], [18, 108]], 5), seed + 2, { jag: 0.4, wander: 1 });
      const tea = ellipse(55, 103, 30, 4.5, 20);
      const wisps = [34, 55, 76].map((x, i) => {
        const pts: Pt[] = [];
        for (let k = 0; k <= 10; k++) {
          const y = 92 - k * 8.2;
          pts.push([x + Math.sin(k * 0.75 + i * 1.7) * 7, y]);
        }
        return smoothPath(pts);
      });
      return `<g class="steam" stroke="${INK.graphite}" stroke-width="4" opacity="0.55" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${
        wisps.map((d, i) => `<path class="s${i}" d="${d}" pathLength="1" stroke-dasharray="0.42 0.58" stroke-dashoffset="0"/>`).join('')}</g>
        ${paper(path(cup), INK.cream)}
        ${paper(path(sleeve), INK.terracotta, 'cut')}
        ${pencilG(pencil([[34, 141], [52, 140], [74, 141]], seed + 5, 1, 0.4), { w: 1.2, op: 0.35 })}
        ${paper(path(rim), INK.paper, 'cut')}
        <path d="${path(tea)}" fill="oklch(48% 0.06 55)" opacity="0.85"/>`;
    },
    update(svg, s) {
      const amt = clamp(s.steam ?? 1, 0, 1);
      const ph = s.phase ?? 0;
      const g = svg.querySelector<SVGGElement>('.steam');
      if (g) g.style.opacity = (0.55 * amt).toFixed(3);
      for (let i = 0; i < 3; i++) {
        const p = svg.querySelector<SVGPathElement>(`.s${i}`);
        if (p) p.style.strokeDashoffset = (-(((ph + i * 0.33) % 1) + 1) % 1).toFixed(3);
      }
    },
  },

  /** A paper flower: five terracotta petals round a butter centre, a sage stem with one leaf. */
  flower: {
    size: [104, 184],
    anchors: { center: [52, 48], grip: [52, 150], head: [52, 48] },
    draw(seed) {
      const stem = tear(ribbon(spline([[52, 70], [49, 110], [53, 150], [51, 178]], 6, false), 7), seed, { jag: 0.4, wander: 1 });
      const leaf = tear(spline([[52, 132], [72, 112], [90, 110], [78, 128], [56, 138]], 4), seed + 1, { jag: 0.5, wander: 1.4 });
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = (-90 + i * 72 + 8) * DEG;
        return paper(path(tear(ellipse(52 + Math.cos(a) * 23, 48 + Math.sin(a) * 23, 17, 22, 26, a + Math.PI / 2), seed + 10 + i, { jag: 0.9, wander: 2 })), INK.terracotta);
      });
      const inner = Array.from({ length: 5 }, (_, i) => {
        const a = (-90 + i * 72 + 8) * DEG;
        return `<path d="${path(ellipse(52 + Math.cos(a) * 21, 48 + Math.sin(a) * 21, 6, 11, 16, a + Math.PI / 2))}" fill="oklch(72% 0.11 50)" opacity="0.55"/>`;
      });
      return `${paper(path(stem), INK.sageDeep, 'thin')}${paper(path(leaf), INK.sage, 'thin')}
        ${pencilG(pencil([[58, 133], [74, 120], [84, 114]], seed + 2, 1, 0.4), { w: 1.1, op: 0.3 })}
        ${petals.join('')}${inner.join('')}
        ${paper(path(tear(ellipse(52, 48, 14, 14, 22), seed + 3, { jag: 0.7, wander: 1.2 })), INK.butter, 'thin')}
        ${pencilG([0, 1, 2, 3, 4].map(i => { const a = i * 1.3; return smoothPath([[52 + Math.cos(a) * 3, 48 + Math.sin(a) * 3], [52 + Math.cos(a) * 7, 48 + Math.sin(a) * 7]]); }), { w: 1.4, op: 0.4 })}`;
    },
  },

  /** A slip of paper with three written lines; `seal` 0–1 the red ○ stamped on it (pressed in, then lifting off). */
  slip: {
    size: [136, 96],
    anchors: { center: [68, 48], seal: [96, 50], grip: [16, 70] },
    draw(seed) {
      const body = tear(poly([[6, 10], [130, 6], [131, 86], [5, 90]], 5), seed, { jag: 0.4, wander: 1.4 });
      const lines = [26, 42, 58].map((y, i) => scribble(16, y, i === 2 ? 34 : 52, seed + 20 + i, 4)).flat();
      const ring: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2.08 - 1.9;
        const r = 21 + Math.sin(i * 0.7) * 0.8;
        ring.push([96 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
      }
      return `${paper(path(body), INK.paper, 'cut')}
        ${pencilG(lines, { w: 1.4, op: 0.5 })}
        <g class="seal" opacity="0"><path d="${smoothPath(ring)}" stroke="${INK.red}" stroke-width="6.5" fill="none" stroke-linecap="round" filter="url(#${F}crayon)"/></g>`;
    },
    update(svg, s) {
      const u = clamp(s.seal ?? 0, 0, 1);
      const g = svg.querySelector<SVGGElement>('.seal');
      if (!g) return;
      g.style.opacity = u > 0 ? (0.25 + 0.75 * smooth(u * 1.6)).toFixed(3) : '0';
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = 'center';
      g.style.transform = `scale(${(1.12 - 0.12 * smooth(u * 1.4)).toFixed(3)})`;
    },
  },

  /** A small seal stamp (hanko): a wooden handle, its red face. */
  stamp: {
    size: [44, 76],
    anchors: { center: [22, 38], grip: [22, 26], face: [22, 70] },
    draw(seed) {
      const handle = tear(spline([[13, 8], [22, 4], [31, 8], [32, 50], [12, 50]], 4), seed, { jag: 0.4, wander: 0.8 });
      const base = tear(poly([[7, 48], [37, 48], [37, 66], [7, 66]], 4), seed + 1, { jag: 0.4, wander: 0.8 });
      const face = tear(poly([[7, 64], [37, 64], [37, 71], [7, 71]], 4), seed + 2, { jag: 0.3, wander: 0.6 });
      return `${paper(path(handle), INK.wood, 'cut')}${paper(path(base), INK.cream, 'cut')}${paper(path(face), INK.red, 'thin')}
        ${pencilG(pencil([[17, 14], [17, 44]], seed + 3, 1, 0.4), { w: 1.6, op: 0.28, color: INK.rim })}`;
    },
  },

  /** A small pennant on a stick: a terracotta paper flag with a cream stripe; `wave` (cycles) ripples it. */
  pennant: {
    size: [126, 156],
    anchors: { center: [56, 44], grip: [12, 128], top: [12, 12] },
    draw(seed) {
      const stick = tear(ribbon([[12, 152], [12, 8]], 7), seed, { jag: 0.3, wander: 0.6 });
      return `${paper(path(stick), INK.wood, 'cut')}
        <g class="flag"></g>
        ${paper(path(tear(ellipse(12, 8, 6, 6, 14), seed + 1, { jag: 0.3, wander: 0.5 })), INK.butter, 'thin')}`;
    },
    update(svg, s, seed) {
      const g = svg.querySelector<SVGGElement>('.flag');
      if (!g) return;
      const ph = (s.wave ?? 0) * Math.PI * 2;
      const bend = (pts: Pt[]) => pts.map(([x, y]) => [x, y + Math.sin((x - 14) / 26 - ph) * 5 * ((x - 14) / 90)] as const);
      const flag = bend(tear(poly([[14, 16], [118, 42], [14, 70]], 5), seed + 2, { jag: 0.6, wander: 1.4 }));
      const stripe = bend(poly([[14, 36], [70, 41], [70, 46], [14, 50]], 4));
      g.innerHTML = `${paper(path(flag), INK.terracotta)}<path d="${path(stripe)}" fill="${INK.cream}" opacity="0.9"/>`;
    },
  },

  /** A paper star, butter yellow; `shine` 0–1 a few short gold strokes round it. */
  star: {
    size: [132, 132],
    anchors: { center: [66, 68], grip: [66, 104] },
    draw(seed) {
      const star = tear(poly(starPts(66, 68, 50, 22), 5), seed, { jag: 0.6, wander: 1.6 });
      const inner = poly(starPts(66, 68, 30, 13), 5);
      const rays = Array.from({ length: 5 }, (_, i) => {
        const a = (-90 + 36 + i * 72) * DEG;
        return pencil([[66 + Math.cos(a) * 40, 68 + Math.sin(a) * 40], [66 + Math.cos(a) * 60, 68 + Math.sin(a) * 60]], seed + 5 + i, 1, 0.3)[0];
      });
      return `${pencilG(rays, { w: 5, op: 0.95, color: INK.gold, cls: 'sh', dash: true }).replace(`filter="url(#${F}graphite)"`, `filter="url(#${F}crayon)"`)}
        ${paper(path(star), INK.butter)}
        <path d="${path(inner)}" fill="${INK.goldLight}" opacity="0.7"/>`;
    },
    update(svg, s) {
      drawIn(svg, '.sh', s.shine ?? 0);
    },
  },

  /** A small story card: cream, a terracotta header rule, handwriting; `lines` 0–1 writes them, `underline` 0–1 underlines the second. */
  card: {
    size: [132, 98],
    anchors: { center: [66, 49], grip: [14, 74] },
    draw(seed) {
      const card = tear(spline([[10, 8], [122, 6], [126, 10], [126, 86], [122, 90], [10, 92], [6, 88], [6, 12]], 5), seed, { jag: 0.3, wander: 0.8 });
      const lines = [36, 52, 68].map((y, i) => scribble(18, y, [86, 92, 60][i], seed + 30 + i, 4.2));
      const und: Pt[] = [];
      for (let x = 16; x <= 112; x += 6) und.push([x, 58 + Math.sin(x * 0.18) * 1.2]);
      return `${paper(path(card), INK.paper, 'cut')}
        <path d="M14,22 L118,20" stroke="${INK.terracotta}" stroke-width="2.4" opacity="0.8" filter="url(#${F}graphite)"/>
        ${lines.map((l, i) => pencilG(l, { w: 1.6, op: 0.62, cls: `l l${i}`, dash: true })).join('')}
        <g class="u" stroke="${INK.terracotta}" stroke-width="4.5" fill="none" stroke-linecap="round" filter="url(#${F}crayon)"><path d="${smoothPath(und)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></g>`;
    },
    update(svg, s) {
      const u = s.lines ?? 1;
      for (let i = 0; i < 3; i++) drawIn(svg, `.l${i}`, clamp(u * 3 - i, 0, 1));
      drawIn(svg, '.u', s.underline ?? 0);
    },
  },

  /**
   * Paper confetti in the cast's colours, flung up from `center` and drifting down: `t` 0–1 is its flight (each bit
   * grows in, tumbles and shrinks away before the end, so nothing is left on the sticker at t = 1).
   */
  confetti: {
    size: [640, 640],
    anchors: { center: [320, 380] },
    draw(seed) {
      const r = rng(seed);
      return Array.from({ length: CONFETTI_N }, (_, i) => {
        const c = CAST_COLOURS[i % CAST_COLOURS.length];
        const kind = r();
        const d = kind < 0.45 ? path(tear(poly([[-7, -5], [7, -5], [7, 5], [-7, 5]], 3), seed + i, { jag: 0.3, wander: 0.5 }))
          : kind < 0.75 ? path(tear(ellipse(0, 0, 5.5, 5.5, 12), seed + i, { jag: 0.3, wander: 0.4 }))
            : path(tear(poly([[-10, -2.5], [10, -2.5], [10, 2.5], [-10, 2.5]], 3), seed + i, { jag: 0.2, wander: 0.4 }));
        return `<g class="b" data-i="${i}" style="visibility:hidden">${paper(d, c, 'thin')}</g>`;
      }).join('');
    },
    update(svg, s, seed) {
      const t = s.t ?? 0;
      const bits = confettiBits(seed);
      svg.querySelectorAll<SVGGElement>('.b').forEach((g, i) => {
        const b = bits[i];
        const u = clamp((t - b.life0) / (b.life1 - b.life0), 0, 1);
        const life = u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 0.5 : 0;
        if (life <= 0.01) {
          g.style.visibility = 'hidden';
          return;
        }
        const tt = u * 1.4;
        const drag = 1 - Math.exp(-2.2 * tt);
        const x = 320 + (b.vx / 2.2) * drag + Math.sin(tt * 5 + i) * b.sway;
        const y = 380 + (b.vy / 2.2) * drag + 260 * tt * tt * 0.6;
        g.style.visibility = '';
        g.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(b.spin * tt)}) scale(${(1.25 * life).toFixed(3)} ${(1.25 * life * Math.abs(Math.cos(tt * 4 + i))).toFixed(3)})`);
      });
    },
  },

  /** The brand's wave, ≋: three wavy terracotta paper strips; `show` 0–1 grows them, `pulse` 0–1 runs one beat through them. */
  wave: {
    size: [150, 92],
    anchors: { center: [75, 46] },
    draw(seed) {
      return [22, 46, 70].map((y0, i) => {
        const line: Pt[] = [];
        for (let x = 12; x <= 138; x += 3) line.push([x, y0 + Math.sin(((x - 12) / 42) * Math.PI * 2) * 6.5]);
        return `<g class="w w${i}">${paper(path(tear(ribbon(line, 9.5), seed + i, { jag: 0.5, wander: 0.8 })), INK.terracotta, 'thin')}</g>`;
      }).join('');
    },
    update(svg, s) {
      const show = clamp(s.show ?? 1, 0, 1);
      const ph = s.pulse ?? 0;
      for (let i = 0; i < 3; i++) {
        const u = clamp(ph * 1.3 - i * 0.15, 0, 1);
        const v = Math.sin(Math.PI * u);
        const g = svg.querySelector<SVGGElement>(`.w${i}`);
        if (!g) continue;
        g.style.transformBox = 'fill-box';
        g.style.transformOrigin = 'center';
        const sc = smooth(clamp(show * 1.4 - i * 0.2, 0, 1));
        g.style.transform = `scale(${(sc * (0.86 + 0.2 * v)).toFixed(3)},${(sc * (1 + 0.25 * v)).toFixed(3)})`;
        g.style.visibility = sc <= 0.001 ? 'hidden' : '';
      }
    },
  },

  /** A tear that glints like 悄悄's stars: a pale drop, and `glint` 0–1 its little four-point shine. */
  tear: {
    size: [48, 52],
    anchors: { center: [22, 30], top: [22, 12] },
    draw(seed) {
      const drop: Pt[] = [];
      for (let i = 0; i < 30; i++) {
        const t = (i / 30) * Math.PI * 2;
        const r = 10 * (1 - 0.82 * Math.max(0, -Math.sin(t)) ** 3);
        drop.push([22 + Math.cos(t) * r * (1 - 0.55 * Math.max(0, -Math.sin(t))), 33 + Math.sin(t) * r * (Math.sin(t) < 0 ? 2.1 : 1)]);
      }
      return `${paper(path(tear(drop, seed, { jag: 0.2, wander: 0.4 })), 'oklch(88% 0.05 230)', 'thin')}
        <path d="M18,30 Q17,36 21,39" stroke="oklch(98% 0.01 230)" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.9"/>
        <g class="g"><path d="${path(twinklePts(34, 14, 11, 0.24))}" fill="oklch(98% 0.03 95)" stroke="oklch(85% 0.09 92)" stroke-width="1.2"/></g>`;
    },
    update(svg, s) {
      scaleAll(svg, '.g', clamp(s.glint ?? 0, 0, 1.2));
    },
  },

  /** One of 悄悄's stars held up like a lantern: a cream four-point star, and `glow` 0–1 its warm paper halos. */
  lantern: {
    size: [150, 150],
    anchors: { center: [75, 75], grip: [75, 108] },
    draw(seed) {
      return `<g class="h2">${paper(path(tear(ellipse(75, 75, 70, 70, 40), seed + 1, { jag: 1.2, wander: 5 })), INK.goldPale, 'thin')}</g>
        <g class="h1">${paper(path(tear(ellipse(75, 75, 50, 50, 34), seed + 2, { jag: 1, wander: 4 })), INK.goldLight, 'thin')}</g>
        ${paper(path(tear(twinklePts(75, 75, 34, 0.26), seed + 3, { jag: 0.4, wander: 0.8 })), 'oklch(96% 0.02 85)', 'thin')}
        <circle cx="75" cy="75" r="7" fill="${INK.goldLight}"/>`;
    },
    update(svg, s) {
      const g = clamp(s.glow ?? 0, 0, 1);
      scaleAll(svg, '.h2', g > 0 ? 0.5 + 0.5 * smooth(g) : 0);
      scaleAll(svg, '.h1', g > 0 ? 0.68 + 0.32 * smooth(g) : 0);
    },
  },

  /** A paper sun: a torn warm disc, a paler middle, torn rays that `rays` 0–1 grows out. */
  sun: {
    size: [250, 250],
    anchors: { center: [125, 125] },
    draw(seed) {
      const rays = Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 + 15) * DEG;
        const r0 = 66;
        const r1 = i % 2 ? 100 : 114;
        const w = 9 * DEG;
        const tri: Pt[] = [[125 + Math.cos(a - w) * r0, 125 + Math.sin(a - w) * r0], [125 + Math.cos(a) * r1, 125 + Math.sin(a) * r1], [125 + Math.cos(a + w) * r0, 125 + Math.sin(a + w) * r0]];
        return `<g class="ray">${paper(path(tear(poly(tri, 4), seed + 10 + i, { jag: 0.5, wander: 1 })), INK.sunLight, 'cut')}</g>`;
      });
      return `${rays.join('')}
        ${paper(path(tear(ellipse(125, 125, 74, 74, 48), seed, { jag: 1.2, wander: 5 })), INK.sun)}
        <path d="${path(tear(ellipse(119, 119, 50, 50, 36), seed + 1, { jag: 0.8, wander: 3 }))}" fill="${INK.sunLight}" opacity="0.55" filter="url(#${F}crayon-soft)"/>`;
    },
    update(svg, s) {
      const u = clamp(s.rays ?? 1, 0, 1);
      svg.querySelectorAll<SVGGElement>('.ray').forEach((g, i) => {
        const v = smooth(clamp(u * 1.5 - (i % 3) * 0.2, 0, 1));
        g.style.transformBox = 'view-box';
        g.style.transformOrigin = '125px 125px';
        g.style.transform = `scale(${(0.6 + 0.4 * v).toFixed(3)})`;
      });
    },
  },

  /** Joy strokes: six short terracotta crayon strokes round a point; `draw` 0–1 pops them out. */
  burst: {
    size: [140, 140],
    anchors: { center: [70, 70] },
    draw(seed) {
      const ds = Array.from({ length: 6 }, (_, i) => {
        const a = (-90 + (i - 2.5) * 34) * DEG;
        const r0 = 40;
        const r1 = 62 - (i % 2) * 7;
        return pencil([[70 + Math.cos(a) * r0, 70 + Math.sin(a) * r0], [70 + Math.cos(a) * r1, 70 + Math.sin(a) * r1]], seed + i, 1, 0.4)[0];
      });
      return pencilG(ds, { w: 6, op: 0.95, color: INK.terracotta, cls: 'j', dash: true }).replace(`filter="url(#${F}graphite)"`, `filter="url(#${F}crayon)"`);
    },
    update(svg, s) {
      drawIn(svg, '.j', s.draw ?? 1);
    },
  },

  /** A small four-point sparkle of gold paper; `show` 0–1 grows it. */
  sparkle: {
    size: [56, 56],
    anchors: { center: [28, 28] },
    draw(seed) {
      return `<g class="sp">${paper(path(tear(twinklePts(28, 28, 22, 0.25), seed, { jag: 0.3, wander: 0.5 })), INK.gold, 'cut')}
        <path d="${path(twinklePts(28, 28, 11, 0.3))}" fill="${INK.goldPale}" opacity="0.8"/></g>`;
    },
    update(svg, s) {
      scaleAll(svg, '.sp', clamp(s.show ?? 1, 0, 1.3));
    },
  },

  /**
   * Sparkles that carry meaning (round 22: one `sparkle` is about 10 px at 128 pt and gone at 72): a cluster of three,
   * the big one 1.6× a `sparkle`, two smaller round it; `show` 0–1 grows them in turn. For a single big one, draw a
   * `sparkle` at `scale: SPARKLE_BIG`.
   */
  sparkles: {
    size: [120, 110],
    anchors: { center: [60, 55] },
    draw(seed) {
      return [[44, 60, 35], [92, 30, 18], [94, 84, 14]].map(([x, y, r], i) =>
        `<g class="sp sp${i}">${paper(path(tear(twinklePts(x, y, r, 0.25), seed + i, { jag: 0.3, wander: 0.5 })), INK.gold, 'cut')}
        <path d="${path(twinklePts(x, y, r / 2, 0.3))}" fill="${INK.goldPale}" opacity="0.8"/></g>`).join('');
    },
    update(svg, s) {
      const u = clamp(s.show ?? 1, 0, 1.3);
      for (let i = 0; i < 3; i++) scaleAll(svg, `.sp${i}`, smooth(clamp(Math.min(u, 1) * 1.6 - i * 0.3, 0, 1)) * Math.max(1, u));
    },
  },

  /**
   * Three short pencil strokes falling to the right of a point (draw it mirrored, `sx: -1`, on the other side): a bow's
   * motion lines at the shoulders (bowStrokes), or anything that drops. `draw` 0–1.
   */
  strokes: {
    size: [60, 64],
    anchors: { center: [30, 32], left: [6, 16], right: [54, 16] },
    draw(seed) {
      const ds = [[12, 8], [28, 4], [44, 10]].map(([x, y], i) =>
        pencil([[x, y], [x + 3, y + 22 + (i % 2) * 8]], seed + i, 1, 0.3)[0]);
      return pencilG(ds, { w: 4.2, op: 0.8, cls: 'st', dash: true });
    },
    update(svg, s) {
      drawIn(svg, '.st', s.draw ?? 1);
    },
  },

  /** Sleepy z's, in pencil; `draw` 0–1 writes them. */
  zz: {
    size: [76, 76],
    anchors: { center: [38, 38] },
    draw(seed) {
      return pencilG([
        ...pencil([[8, 46], [26, 46], [8, 66], [26, 66]], seed, 2, 0.6),
        ...pencil([[38, 12], [64, 12], [38, 38], [64, 38]], seed + 1, 2, 0.7),
      ], { w: 3.8, op: 0.75, cls: 'z', dash: true });
    },
    update(svg, s) {
      drawIn(svg, '.z', s.draw ?? 1);
    },
  },

  /** Four handwriting lines in pencil, to lay on a card (聆聆's); `lines` 0–1 writes them one by one. */
  scribble: {
    size: [140, 76],
    anchors: { center: [70, 38] },
    draw(seed) {
      return [14, 30, 46, 62].map((y, i) => pencilG(scribble(8, y, [118, 104, 122, 70][i], seed + i, 4.6), { w: 1.8, op: 0.7, cls: `l${i}`, dash: true })).join('');
    },
    update(svg, s) {
      const u = s.lines ?? 1;
      for (let i = 0; i < 4; i++) drawIn(svg, `.l${i}`, clamp(u * 4 - i, 0, 1));
    },
  },

  /** A terracotta crayon underline; `draw` 0–1 draws it left to right. */
  underline: {
    size: [140, 22],
    anchors: { center: [70, 11], start: [8, 11] },
    draw() {
      const pts: Pt[] = [];
      for (let x = 8; x <= 132; x += 6) pts.push([x, 11 + Math.sin(x * 0.16) * 1.6]);
      return `<g class="u" stroke="${INK.terracotta}" stroke-width="5.5" fill="none" stroke-linecap="round" filter="url(#${F}crayon)"><path d="${smoothPath(pts)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></g>`;
    },
    update(svg, s) {
      drawIn(svg, '.u', s.draw ?? 1);
    },
  },

  /**
   * A page standing on its edge, torn down its sides, faint rules on it: something to peek out from behind (the
   * sticker's own edge can't be: the die-cut needs room all round). Put the puppet behind it (a lower z).
   */
  panel: {
    size: [190, 470],
    anchors: { center: [95, 235], top: [95, 18], left: [16, 235], right: [174, 235], base: [95, 456] },
    draw(seed) {
      const sheet = tear(spline([[18, 22], [100, 12], [176, 20], [170, 140], [178, 300], [172, 458], [96, 462], [14, 456], [20, 300], [12, 150]], 7), seed, { jag: 1.1, wander: 4 });
      const rules = [70, 112, 154, 196, 238, 280, 322, 364, 406].map(y => pencil([[30, y], [95, y - 1], [160, y + 1]], seed + y, 1, 0.3)[0]);
      return `${paper(path(sheet), INK.paper)}
        ${pencilG(rules, { w: 1.2, op: 0.16, color: 'oklch(55% 0.06 230)' })}
        ${pencilG(pencil([[44, 30], [42, 250], [44, 450]], seed + 3, 1, 0.4), { w: 1.4, op: 0.3, color: INK.terracotta })}`;
    },
  },

  /**
   * A torn strip of paper lying along the sticker's foot, for popping up from behind (點點's hello): sage-tinted, its
   * top edge torn. Put the puppet behind it (a lower z).
   */
  ground: {
    size: [420, 120],
    anchors: { center: [210, 60], top: [210, 16], base: [210, 108] },
    draw(seed) {
      const top: Pt[] = [];
      for (let x = 10; x <= 410; x += 20) top.push([x, 18 + Math.sin(x * 0.03 + seed) * 5]);
      const strip = tear(poly([...top, [410, 110], [10, 110]], 6), seed, { jag: 1.1, wander: 4 });
      return `${paper(path(strip), 'oklch(86% 0.04 140)')}
        ${pencilG(pencil([[24, 52], [210, 50], [396, 53]], seed + 1, 1, 0.4), { w: 1.3, op: 0.18 })}`;
    },
  },
};

/** Where a prop is drawn this frame: px of the sticker, px per rig unit, turn, and which of its points goes there. */
export interface PropAt {
  /** Px per rig unit (its puppet's k, usually). */
  k: number;
  rot?: number;
  alpha?: number;
  /** A named anchor, or a point of its drawing (rig units). Defaults to `center`. */
  anchor?: string | Pt;
  /** Extra scale (on top of k): grow in from 0, a beat. */
  scale?: number;
  sx?: number;
  sy?: number;
}

/** A prop on the sticker. */
export class Prop {
  readonly el: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly def: KindDef;
  z: number;
  /** The puppet it's inside (between its parts), if any: `at` is still sticker px. */
  inside: { body: HTMLElement; toBody(x: number, y: number): [number, number]; tilt(): number } | null = null;
  private shown = false;

  constructor(doc: Document, readonly kind: PropKind, readonly seed: number, z: number) {
    this.def = PROP_KINDS[kind];
    const [w, h] = this.def.size;
    const el = doc.createElement('div');
    el.className = 'sk-prop';
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${this.def.draw(seed)}</svg>`;
    this.el = el;
    this.svg = el.querySelector('svg')!;
    this.z = z;
    this.hide();
  }

  /** Puts its `anchor` at (x, y) on the sticker. Call every frame it shows; a frame without a call hides it. */
  at(x: number, y: number, o: PropAt): this {
    const a = o.anchor ?? 'center';
    const [ax, ay] = typeof a === 'string' ? this.def.anchors[a] ?? this.def.anchors.center : a;
    let rot = o.rot ?? 0;
    if (this.inside) {
      [x, y] = this.inside.toBody(x, y);
      rot -= this.inside.tilt();
    }
    const s = o.k * (o.scale ?? 1);
    const sx = s * (o.sx ?? 1);
    const sy = s * (o.sy ?? 1);
    this.el.style.transform = `translate(${f1(x)}px,${f1(y)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)}) translate(${-ax}px,${-ay}px)`;
    const alpha = clamp(o.alpha ?? 1, 0, 1);
    this.el.style.opacity = alpha >= 1 ? '' : alpha.toFixed(3);
    this.el.style.visibility = alpha > 0 && s > 0 ? '' : 'hidden';
    // inside a puppet its place among the parts is its paint order (a z-index would lift it over the parts after it)
    this.el.style.zIndex = this.inside ? '' : String(Math.round(this.z));
    this.shown = true;
    return this;
  }

  /** Its state this frame (see each kind). */
  set(s: PropState): this {
    this.def.update?.(this.svg, s, this.seed);
    return this;
  }

  hide(): void {
    this.el.style.visibility = 'hidden';
  }

  /** Before a frame: forget last frame's placing (a prop not placed this frame is hidden). */
  begin(): void {
    this.shown = false;
  }
  end(): void {
    if (!this.shown) this.hide();
  }
}

/** Each kind's initial state, set once so a prop drawn without `set` shows its plain self. */
export function initProp(p: Prop): void {
  p.def.update?.(p.svg, {}, p.seed);
}

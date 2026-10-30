/**
 * What 悄悄's pack needs that the kit doesn't have, kept inside the pack (four packs are drawn at once, so the kit is
 * left alone): prop kinds registered beside the kit's own, under names no kit prop has, and one small helper.
 *
 *   hush-glisten  — a wet shine laid over one of its eyes (眼眶濕濕的): a pale water line along the lower rim and a
 *                   second, brighter catch-light; `show` 0–1 grows it in about the eye's middle.
 *   hush-teardrop — a real teardrop (pointed top, round foot) of pale blue paper with a catch-light; `glint` 0–1
 *                   brightens the catch-light (the kit's tear is round, and read as a marble at chat sizes).
 *   hush-glow     — the light it holds up (我在這裡): a round, warm glow of torn gold paper with a small star inside
 *                   (no rays: with them it reads as a sun, 摺摺's morning); `glow` 0–1 opens the glow. Held at
 *                   `grip`.
 *   hush-twinkle  — a small four-pointed glint of cream paper, laid over one of its pin-prick stars as it lights, so
 *                   a lit star reads as a star (and not a yellow spot) on the day paper; `show` grows it.
 *   hush-seat     — a kraft story card to sit on (慢慢說，我在聽): mid-toned so it never glares on the night paper,
 *                   a terracotta rule and two bold pencil lines (fine handwriting turns to grime at chat sizes).
 *   smile()       — widens its smile a little (the mouth part scaled about its own pivot).
 */
import { PROP_KINDS, type PropKind, type PropState, type StickerPuppet } from '../kit';
import { ellipse, F, INK, path, pencil, poly, spline, tear, type Pt } from '../kit/paper';

interface LocalKind {
  size: readonly [number, number];
  anchors: Record<string, Pt>;
  draw(seed: number): string;
  update?(svg: SVGSVGElement, s: PropState, seed: number): void;
}

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (u: number) => {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
};

/** A soft four-pointed glint (悄悄's stars): concave sides, `waist` the inner radius over the outer, turned `rot`°. */
function glint(cx: number, cy: number, r: number, waist: number, rot = 0): Pt[] {
  const keys: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * waist : r;
    const a = (rot - 90 + i * 45) * DEG;
    keys.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return spline(keys, 3);
}

/** Torn paper with the kit's fibre rim and glue shadow (its `paper` / `thin` filters). */
const paper = (d: string, fill: string, filter = 'thin') => `<path d="${d}" fill="${fill}" filter="url(#${F}${filter})"/>`;
/** Pencil or crayon strokes. */
const strokes = (ds: string[], w: number, color: string, op: number, filter: string) =>
  `<g stroke="${color}" stroke-width="${w}" opacity="${op}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#${F}${filter})">${
    ds.map(d => `<path d="${d}"/>`).join('')}</g>`;

/** Scale every group matching `sel` about a point of the drawing. */
function grow(svg: SVGSVGElement, sel: string, at: Pt, v: number): void {
  svg.querySelectorAll<SVGGElement>(sel).forEach(el => {
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = `${at[0]}px ${at[1]}px`;
    el.style.transform = `scale(${Math.max(0, v).toFixed(3)})`;
    el.style.visibility = v <= 0.001 ? 'hidden' : '';
  });
}

function register(name: string, def: LocalKind): PropKind {
  (PROP_KINDS as unknown as Record<string, LocalKind>)[name] = def;
  return name as PropKind;
}

/** The water: light blue, as the kit's tear is. */
const WATER = 'oklch(86% 0.06 230)';
const SHINE = 'oklch(99% 0.01 230)';

/** The eye's middle in this drawing (its box is the rig's open eye, 26 × 31 units, a little larger all round). */
const EYE: Pt = [20, 22];

export const GLISTEN = register('hush-glisten', {
  size: [40, 44],
  anchors: { center: EYE },
  draw() {
    const [cx, cy] = EYE;
    // the water line: a soft crescent along the lower half of the eye, inside its rim
    const top: Pt[] = spline([[cx - 8.5, cy + 3], [cx, cy + 6.5], [cx + 8.5, cy + 3]], 2, false);
    const bottom: Pt[] = spline([[cx + 8, cy + 5], [cx, cy + 11], [cx - 8, cy + 5]], 2, false);
    return `<g class="gl">
      <path d="${path([...top, ...bottom])}" fill="${WATER}" opacity="0.85"/>
      <path d="${path(ellipse(cx + 3.6, cy + 5.2, 1.9, 1.3, 10))}" fill="${SHINE}"/>
      <path d="${path(ellipse(cx - 4.2, cy - 5.4, 2.2, 2.2, 10))}" fill="${SHINE}"/>
    </g>`;
  },
  update(svg, s) {
    grow(svg, '.gl', EYE, clamp(s.show ?? 1, 0, 1.2));
  },
});

/** The teardrop's round foot, in its drawing: the anchor that sits on the cheek. */
const DROP: Pt = [20, 34];

export const TEARDROP = register('hush-teardrop', {
  size: [40, 52],
  anchors: { center: DROP, top: [20, 10] },
  draw(seed) {
    // a teardrop: x = r·sin t·sin(t/2), y = −h·cos t — its point at the top (t = 0), its round foot below
    const r = 10.5;
    const pts: Pt[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const y = -Math.cos(t);
      pts.push([DROP[0] + r * Math.sin(t) * Math.sin(t / 2) * 1.12, DROP[1] - 4 + (y < 0 ? y * 20 : y * 10.5)]);
    }
    return `${paper(path(tear(pts, seed, { jag: 0.15, wander: 0.3 })), WATER)}
      <path d="M${DROP[0] - 5.2},${DROP[1] - 4} Q${DROP[0] - 6.4},${DROP[1] + 2} ${DROP[0] - 2.6},${DROP[1] + 4.6}" stroke="${SHINE}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.95"/>
      <g class="g"><path d="${path(ellipse(DROP[0] + 3.2, DROP[1] - 1.5, 2.4, 2.4, 10))}" fill="${SHINE}"/></g>`;
  },
  update(svg, s) {
    grow(svg, '.g', [DROP[0] + 3.2, DROP[1] - 1.5], 0.7 + 0.6 * clamp(s.glint ?? 0, 0, 1));
  },
});

/** The glow's middle, in its drawing. */
const GLOW_AT: Pt = [90, 86];

export const GLOW = register('hush-glow', {
  size: [180, 190],
  anchors: { center: GLOW_AT, grip: [90, 142] },
  draw(seed) {
    const [cx, cy] = GLOW_AT;
    return `<g class="h2">${paper(path(tear(ellipse(cx, cy, 60, 60, 40), seed + 1, { jag: 1.1, wander: 4 })), INK.goldPale)}</g>
      <g class="h1">${paper(path(tear(ellipse(cx, cy, 44, 44, 34), seed + 2, { jag: 0.9, wander: 3 })), INK.goldLight)}</g>
      ${paper(path(tear(glint(cx, cy, 24, 0.3), seed + 3, { jag: 0.3, wander: 0.6 })), 'oklch(97% 0.02 88)')}
      <path d="${path(ellipse(cx, cy, 5.5, 5.5, 12))}" fill="${INK.gold}"/>`;
  },
  update(svg, s) {
    const g = clamp(s.glow ?? 0, 0, 1.2);
    const e = smooth(g);
    grow(svg, '.h2', GLOW_AT, g > 0 ? 0.55 + 0.45 * e : 0);
    grow(svg, '.h1', GLOW_AT, g > 0 ? 0.7 + 0.3 * e : 0);
  },
});

/** The twinkle's middle, in its drawing. */
const TWINKLE_AT: Pt = [20, 20];

export const TWINKLE = register('hush-twinkle', {
  size: [40, 40],
  anchors: { center: TWINKLE_AT },
  draw(seed) {
    const [cx, cy] = TWINKLE_AT;
    return `<g class="tw">${paper(path(tear(glint(cx, cy, 15, 0.26), seed, { jag: 0.2, wander: 0.3 })), 'oklch(96% 0.035 90)')}
      <path d="${path(ellipse(cx, cy, 3, 3, 10))}" fill="${INK.goldLight}"/></g>`;
  },
  update(svg, s) {
    grow(svg, '.tw', TWINKLE_AT, clamp(s.show ?? 1, 0, 1.4));
  },
});

/** Kraft: a mid tone that reads on both papers and never glares on the night one. */
const KRAFT = 'oklch(71% 0.055 68)';

export const SEAT = register('hush-seat', {
  size: [400, 124],
  anchors: { center: [200, 62], top: [200, 10] },
  draw(seed) {
    const card = tear(poly([[12, 12], [388, 8], [392, 114], [8, 116]], 8), seed, { jag: 1, wander: 3 });
    return `${paper(path(card), KRAFT, 'paper')}
      ${strokes(pencil([[30, 30], [200, 28], [370, 31]], seed + 1, 1, 0.5), 4, INK.terracotta, 0.85, 'crayon')}
      ${strokes(pencil([[44, 62], [150, 60], [256, 63]], seed + 2, 1, 0.5), 3.4, INK.graphite, 0.5, 'graphite')}
      ${strokes(pencil([[44, 88], [120, 87], [196, 89]], seed + 3, 1, 0.5), 3.4, INK.graphite, 0.5, 'graphite')}`;
  },
});

/** Widens its smile a little: the mouth part scaled about its pivot (1: as drawn). Set it every frame. */
export function smile(h: StickerPuppet, s: number): void {
  const im = h.partImg('mouth');
  if (im) im.style.transform = s === 1 ? '' : `scale(${s.toFixed(3)},${(1 + (s - 1) * 0.5).toFixed(3)})`;
}

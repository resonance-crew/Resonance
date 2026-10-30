/**
 * What 悄悄's pack needs that the kit doesn't have, kept inside the pack (four packs are drawn at once, so the kit is
 * left alone): a prop kind registered beside the kit's own, under a name no kit prop has.
 *
 *   glisten — a wet shine laid over one of its eyes (眼眶濕濕的): a pale water line along the lower rim and a second,
 *             brighter catch-light; `show` 0–1 grows it in about the eye's middle. Drawn on the puppet (z over it),
 *             so opacity would be fine too, but it is grown like every other prop.
 *   star-lantern — one of its own stars held up like a lantern (我在這裡): its four-pointed glint in cream paper, its
 *             light two larger glints of gold paper behind it (one turned a quarter of a point, so together they
 *             shine eight ways) — light in the series' torn paper, where the kit's lantern lays round discs, which
 *             at 128 pt read as a plate. `glow` 0–1 grows the light out from behind the star. Held at `grip`, below
 *             the light's lower points, so the mitten shows.
 */
import { PROP_KINDS, type PropKind, type PropState } from '../kit';
import { ellipse, F, INK, path, spline, tear, type Pt } from '../kit/paper';

interface LocalKind {
  size: readonly [number, number];
  anchors: Record<string, Pt>;
  draw(seed: number): string;
  update?(svg: SVGSVGElement, s: PropState, seed: number): void;
}

const DEG = Math.PI / 180;

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
    const v = Math.max(0, Math.min(1.2, s.show ?? 1));
    svg.querySelectorAll<SVGGElement>('.gl').forEach(g => {
      g.style.transformBox = 'view-box';
      g.style.transformOrigin = `${EYE[0]}px ${EYE[1]}px`;
      g.style.transform = `scale(${v.toFixed(3)})`;
      g.style.visibility = v <= 0.001 ? 'hidden' : '';
    });
  },
});

/** The light's inner glint: a warm butter, deep enough to read on the day paper (the outer one may melt into it). */
const GLOW = 'oklch(86% 0.11 88)';
/** The lantern's middle, in its drawing. */
const LANTERN: Pt = [90, 86];

export const STAR_LANTERN = register('hush-star-lantern', {
  size: [180, 190],
  anchors: { center: LANTERN, grip: [90, 150] },
  draw(seed) {
    const [cx, cy] = LANTERN;
    return `<g class="h2">${paper(path(tear(glint(cx, cy, 84, 0.34, 45), seed + 1, { jag: 0.8, wander: 2.4 })), INK.goldPale)}</g>
      <g class="h1">${paper(path(tear(glint(cx, cy, 66, 0.3), seed + 2, { jag: 0.7, wander: 2 })), GLOW)}</g>
      ${paper(path(tear(glint(cx, cy, 40, 0.27), seed + 3, { jag: 0.4, wander: 0.8 })), 'oklch(97% 0.02 88)')}
      <path d="${path(ellipse(cx, cy, 8, 8, 14))}" fill="${INK.goldLight}"/>`;
  },
  update(svg, s) {
    const g = Math.max(0, Math.min(1.2, s.glow ?? 0));
    const grow = (sel: string, v: number) => svg.querySelectorAll<SVGGElement>(sel).forEach(el => {
      el.style.transformBox = 'view-box';
      el.style.transformOrigin = `${LANTERN[0]}px ${LANTERN[1]}px`;
      el.style.transform = `scale(${Math.max(0, v).toFixed(3)})`;
      el.style.visibility = v <= 0.001 ? 'hidden' : '';
    });
    const e = g * g * (3 - 2 * Math.min(1, g));
    grow('.h2', g > 0 ? 0.45 + 0.55 * e : 0);
    grow('.h1', g > 0 ? 0.62 + 0.38 * e : 0);
  },
});

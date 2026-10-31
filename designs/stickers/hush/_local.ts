/**
 * What 悄悄's pack needs that the kit doesn't have, kept inside the pack (four packs are drawn at once, so the kit is
 * left alone): prop kinds registered beside the kit's own, under names no kit prop has, and one small helper.
 *
 *   hush-moved-eye — its 🥹 eye (眼眶濕濕的), drawn as the rig's own eye is (round 4's white-pencil eye with the family's
 *                   graphite bean) but 1.4× as large, so water fits in it: `show` 0–1 is how full the water stands
 *                   in the bean (a blue sheen over its lower third under a bright brimming line, and a sliver of
 *                   water along the lower lid once it is full — nothing ever runs out), `phase` 0–1 shimmers the catch-lights and the
 *                   water's edge. Laid over the rig's eye (it covers it whole) at the eye's pivot plus the face's slide.
 *   hush-sound    — two small pencil arcs round a cupped mitten (慢慢說，我在聽): what it is listening to; `show` 0–1
 *                   grows them out from the mitten, the inner first.
 *   hush-twinkle  — a small four-pointed glint of cream paper, laid over one of its pin-prick stars as it lights, so
 *                   a lit star reads as a star (and not a yellow spot) on the day paper; `show` grows it.
 *   hush-seat     — a kraft story card to sit on (慢慢說，我在聽): mid-toned so it never glares on the night paper,
 *                   a terracotta rule and two bold pencil lines (fine handwriting turns to grime at chat sizes).
 *   mouth()       — reshapes its smile (the mouth part scaled and turned about its own pivot): a little wider, or a
 *                   small pressed one that wobbles.
 */
import { PROP_KINDS, type PropKind, type PropState, type StickerPuppet } from '../kit';
import { ellipse, F, INK, path, pencil, poly, smoothPath, spline, tear, type Pt } from '../kit/paper';

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

/** The moved eye's middle, in its drawing; the rig's eye is rx 11 × ry 14.2 (round 4's hush.mjs), this one 1.4× as large. */
const MOVED_AT: Pt = [28, 32];
const MOVED_R: Pt = [11 * 1.42, 14.2 * 1.42];
const PEN_FILL = 'oklch(92% 0.03 86)';
const BEAN = 'oklch(29% 0.018 60)';
const GLINT = 'oklch(99.5% 0.004 95)';
const POOL = 'oklch(55% 0.085 238)';
const SHEEN = 'oklch(74% 0.07 228)';
const BRIM = 'oklch(96% 0.03 215)';
/** Round 4's dense white pencil and its graphite bean (hush.mjs: nt-pencil-dense, nt-bean), under ids of this pack. */
const EYE_FILTERS = `<defs>
  <filter id="hush-dense" filterUnits="userSpaceOnUse" x="-50" y="-50" width="150" height="160">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.4" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.5 0 0 0 2.05" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="hush-bean" filterUnits="userSpaceOnUse" x="-50" y="-50" width="150" height="160">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="25" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="26" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.4 0 0 0 2.3" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
</defs>`;

/** The bean inside the moved eye: nearly all of it, a touch low, as round 4 sets the rig's. */
const beanAt = (): [number, number, number, number] => [MOVED_AT[0], MOVED_AT[1] + MOVED_R[1] * 0.06, MOVED_R[0] * 0.86, MOVED_R[1] * 0.86];

/** The water standing in the bean: everything below a gently wavy line, `level` 0–1 of the way up its lower third or so. */
function poolPath(level: number, phase: number): string {
  const [bx, by, brx, bry] = beanAt();
  const top = by + bry - level * bry * 0.72;
  const wave = (x: number) => top + Math.sin((x - bx) / brx * 3.2 + phase * Math.PI * 2) * 0.9;
  const pts: Pt[] = [];
  for (let x = bx - brx - 2; x <= bx + brx + 2; x += 2) pts.push([x, wave(x)]);
  return `M${pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}L${(bx + brx + 2).toFixed(2)},${(by + bry + 3).toFixed(2)}L${(bx - brx - 2).toFixed(2)},${(by + bry + 3).toFixed(2)}Z`;
}
function brimPath(level: number, phase: number): string {
  const [bx, by, brx, bry] = beanAt();
  const top = by + bry - level * bry * 0.72;
  const pts: Pt[] = [];
  for (let x = bx - brx; x <= bx + brx; x += 2) pts.push([x, top + Math.sin((x - bx) / brx * 3.2 + phase * Math.PI * 2) * 0.9]);
  return `M${pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}`;
}

export const MOVED_EYE = register('hush-moved-eye', {
  size: [56, 68],
  anchors: { center: MOVED_AT },
  draw(seed) {
    const [cx, cy] = MOVED_AT;
    const [rx, ry] = MOVED_R;
    const oval = tear(ellipse(cx, cy, rx, ry, 22, seed % 2 ? -0.08 : 0.08), seed, { amp: 0.4, jag: 0.12, wander: 0.35 });
    const [bx, by, brx, bry] = beanAt();
    const bean = tear(ellipse(bx, by, brx, bry, 20), seed + 20, { jag: 0.2, wander: 0.4 });
    const clip = `hush-moved-${seed}`;
    // the sliver of water along the lower lid: a thin crescent hugging the white's foot, just outside it
    const lid: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (25 + (130 * i) / 12) * DEG;
      lid.push([cx + Math.cos(a) * (rx + 0.6), cy + Math.sin(a) * (ry + 0.6)]);
    }
    for (let i = 12; i >= 0; i--) {
      const a = (25 + (130 * i) / 12) * DEG;
      const fat = Math.sin((Math.PI * i) / 12);
      lid.push([cx + Math.cos(a) * (rx + 0.6 + 2.6 * fat), cy + Math.sin(a) * (ry + 0.6 + 3.2 * fat)]);
    }
    return `${EYE_FILTERS}
      <clipPath id="${clip}"><path d="${smoothPath(bean, true)}"/></clipPath>
      <path d="${smoothPath(oval, true)}" fill="${PEN_FILL}" filter="url(#hush-dense)"/>
      <path d="${smoothPath(oval, true)}" fill="none" stroke="${PEN_FILL}" stroke-width="1.4"/>
      <path d="${smoothPath(bean, true)}" fill="${BEAN}" filter="url(#hush-bean)"/>
      <path d="${smoothPath(bean, true)}" fill="none" stroke="${BEAN}" stroke-width="1.2" opacity="0.7"/>
      <g clip-path="url(#${clip})"><path class="pool" d="" fill="${POOL}" opacity="0.92"/></g>
      <g clip-path="url(#${clip})"><path class="sheen" d="" fill="none" stroke="${SHEEN}" stroke-width="3.2" stroke-linecap="round" opacity="0.8" transform="translate(0,2.2)"/><path class="brim" d="" fill="none" stroke="${BRIM}" stroke-width="1.8" stroke-linecap="round"/></g>
      <g class="lid"><path d="${path(lid)}" fill="${POOL}" opacity="0.9"/><path d="${path(lid.slice(0, 13), false)}" fill="none" stroke="${BRIM}" stroke-width="0.9" opacity="0.9"/></g>
      <g class="g1"><path d="${path(ellipse(bx - brx * 0.3, by - bry * 0.36, 5.8, 6.4, 14))}" fill="${GLINT}"/></g>
      <g class="g2"><path d="${path(ellipse(bx + brx * 0.4, by - bry * 0.02, 2.8, 3, 10))}" fill="${GLINT}"/></g>
      <g class="g3"><path d="${path(ellipse(bx - brx * 0.3, by + bry * 0.55, 1.6, 1.4, 8))}" fill="${GLINT}"/></g>`;
  },
  update(svg, s) {
    const level = clamp(s.show ?? 1, 0, 1);
    const phase = s.phase ?? 0;
    const pool = svg.querySelector<SVGPathElement>('.pool');
    const brim = svg.querySelector<SVGPathElement>('.brim');
    if (pool) pool.setAttribute('d', level > 0.02 ? poolPath(level, phase) : '');
    if (brim) brim.setAttribute('d', level > 0.02 ? brimPath(level, phase) : '');
    svg.querySelector<SVGPathElement>('.sheen')?.setAttribute('d', level > 0.02 ? brimPath(level, phase) : '');
    const [bx, by, brx, bry] = beanAt();
    grow(svg, '.lid', [MOVED_AT[0], MOVED_AT[1] + MOVED_R[1]], smooth((level - 0.6) / 0.4));
    // the catch-lights shimmer: they slip a little about their places and breathe
    const sh = Math.sin(phase * Math.PI * 2);
    const ch = Math.cos(phase * Math.PI * 2);
    const nudge = (sel: string, at: Pt, dx: number, dy: number, sc: number) => svg.querySelectorAll<SVGGElement>(sel).forEach(el => {
      el.style.transformBox = 'view-box';
      el.style.transformOrigin = `${at[0]}px ${at[1]}px`;
      el.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scale(${sc.toFixed(3)})`;
    });
    nudge('.g1', [bx - brx * 0.3, by - bry * 0.36], 0.6 * sh, 0.5 * ch, 1 + 0.08 * ch);
    nudge('.g2', [bx + brx * 0.4, by - bry * 0.02], -0.5 * ch, 0.4 * sh, 1 + 0.18 * sh);
    // the small light on the water rides its surface
    nudge('.g3', [bx - brx * 0.3, by + bry * 0.55], 0.8 * sh, (1 - level) * bry * 0.6, level > 0.3 ? 1 + 0.25 * sh : 0);
  },
});

/** The sound arcs' drawing: centred on the mitten they curl round (its left side, opening toward the head). */
const SOUND_AT: Pt = [64, 40];

export const SOUND = register('hush-sound', {
  size: [80, 80],
  anchors: { center: SOUND_AT },
  draw(seed) {
    const [cx, cy] = SOUND_AT;
    const arc = (r: number, s2: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (140 + (80 * i) / 8) * DEG;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return pencil(pts, s2, 2, 0.5);
    };
    return `<g class="a0">${strokes(arc(34, seed), 3.6, INK.graphite, 0.8, 'graphite')}</g>
      <g class="a1">${strokes(arc(48, seed + 1), 3.6, INK.graphite, 0.8, 'graphite')}</g>`;
  },
  update(svg, s) {
    const u = clamp(s.show ?? 1, 0, 1);
    grow(svg, '.a0', SOUND_AT, smooth(u * 1.6));
    grow(svg, '.a1', SOUND_AT, smooth(u * 1.6 - 0.6));
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

/** Reshapes its smile: the mouth part scaled (sx, sy) and turned (rot°) about its pivot. Set it every frame. */
export function mouth(h: StickerPuppet, sx = 1, sy = 1, rot = 0): void {
  const im = h.partImg('mouth');
  if (im) im.style.transform = sx === 1 && sy === 1 && rot === 0 ? '' : `rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
}

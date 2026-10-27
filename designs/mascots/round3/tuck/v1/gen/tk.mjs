// 摺摺 Tuck — round 3 (the owner's pick, revised). Built from round 2's generator (gen/r2copy/tuck.mjs):
// the same sage torn sheet, dog-ear over hidden pencil writing, face, wheat accordion legs, sage feet,
// cream thumbed mittens, brass brads, fibre rim and glue shadow. Round 3 changes only what the owner asked:
//   1. shoulders lower: the brads sit below the mouth line (round 2: ~y420, just under the eyes);
//   2. brads inward: on the sheet's face, two brad radii in from the torn outline, the arm strip tucked
//      under the edge behind the sheet (round 2: pinned on the outline itself);
//   3. arms shorter: shoulder to mitten centre 120 (round 2: 164);
//   4. the torn tab on the head is gone: a fringe of three torn wheat-paper strands, held by a brass paper clip.
// Plus round 2's verification: a bigger thumb with a seam line, and no pose with both mittens at the belly.
//
// Everything is drawn in Tuck's own coordinates (round 2's: the sheet spans about x 248–566, y 246–578,
// the feet stand on y≈684). `rig()` maps them into the series' rig units; `figure()` draws a posed copy.
import { rng, spline, poly, tear, path, smoothPath, reflect, side, pencil, ellipse } from './lib.mjs';

export const F = 'tk-'; // filter id prefix (one set of filters, shared by every copy on a sheet)

// Every paper colour is a custom property with its day value as the fallback (`--tk-body`, …).
export const C = {
  body: 'oklch(80% 0.044 140)',      // sage coloured paper, front
  bodyDeep: 'oklch(68% 0.045 142)',  // the same sheet's offcut (feet)
  back: 'oklch(94.5% 0.02 86)',      // the white side of the coloured paper (the dog-ear's back)
  arm: 'oklch(70% 0.047 143)',       // arm strips: the darker sage offcut
  glove: 'oklch(93% 0.026 86)',      // the family's cream mitten paper
  brass: 'oklch(73% 0.085 82)',
  brassDeep: 'oklch(50% 0.06 68)',
  brassHi: 'oklch(94% 0.035 92)',
  legA: 'oklch(86% 0.066 88)',       // wheat accordion legs, light panels
  legB: 'oklch(75.5% 0.075 82)',     // …and their fold panels
  hair: 'oklch(73.5% 0.082 80)',     // round 3: the fringe, torn from the legs' wheat paper (its deeper side)
  hairLight: 'oklch(85% 0.068 88)',
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(69% 0.1 38)',        // terracotta crayon, three short strokes
  rim: 'oklch(97.5% 0.012 85)',
};
const VAR = { body: 'body', bodyDeep: 'foot', back: 'flap-back', arm: 'arm', glove: 'glove', brass: 'brad', brassDeep: 'brad-rim', brassHi: 'brad-glint', legA: 'leg', legB: 'leg-fold', hair: 'hair', hairLight: 'hair-light', graphite: 'ink', blush: 'blush', glint: 'glint' };
const fill = (k, v) => `style="fill:${v || `var(--tk-${VAR[k]}, ${C[k]})`}"`;
const stroke = (k, v) => `style="stroke:${v || `var(--tk-${VAR[k]}, ${C[k]})`}"`;
const fmt = n => n.toFixed(1);
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- filters (round 2's recipes, tk- ids)
export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-300" y="-300" width="2200" height="1600"';
  return `<defs>
  <!-- torn paper: displaced edge, the white fibres the tear exposes, a glue shadow down-right, fibre specks and mottle inside -->
  <filter id="${F}paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.33  0 0 0 0 0.27  4 0 0 0 -2.86" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- strips that turn (arms): the same paper, its glue shadow shorter, so it still sits right when the engine turns the arm -->
  <filter id="${F}strip" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="17" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.8" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.6" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2.4" result="blur"/><feOffset dx="1" dy="2" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="12" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.33  0 0 0 0 0.27  4 0 0 0 -2.86" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="25" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- thin paper (mittens, hair strands): the same tear, a fainter shorter shadow, a narrower rim, no specks -->
  <filter id="${F}thin" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.3" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.4" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="1.8" result="blur"/><feOffset dx="1" dy="2.2" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.45 0 0 0 -0.2" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <filter id="${F}graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="${F}graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="${F}crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <filter id="${F}crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <filter id="${F}metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
</defs>`;
}

// ---------------------------------------------------------------- the sheet (round 2's, unchanged)
const KEYS = [[262, 352], [290, 296], [334, 264], [420, 250], [500, 250], [552, 268], [566, 360], [556, 470], [500, 552], [404, 578], [312, 562], [258, 494], [248, 420]];
const BODY = tear(spline(KEYS, 8), 41, { jag: 1.3, wander: 11 });
const A = [428, 249], B = [566, 386]; // the dog-ear's crease
const THETA = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
let iStart = 0;
for (let i = 0; i < BODY.length; i++) if (side(BODY[i], A, B) <= 0 && side(BODY[(i - 1 + BODY.length) % BODY.length], A, B) > 0) iStart = i;
const ORDERED = BODY.map((_, i) => BODY[(iStart + i) % BODY.length]);
const CORNER = ORDERED.filter(p => side(p, A, B) <= 0);
const KEEP = ORDERED.filter(p => side(p, A, B) > 0);
const FLAP = [A, ...CORNER.map(p => reflect(p, A, B)), B];
const BODY_D = path(KEEP), FLAP_D = path(FLAP);

// x where a horizontal line at y crosses the outline (leftmost, rightmost)
function edgeX(pts, y) {
  const xs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  }
  return [Math.min(...xs), Math.max(...xs)];
}

// ---------------------------------------------------------------- proportions (round 3)
export const TOP = Math.min(...KEEP.map(p => p[1]), ...FLAP.map(p => p[1])); // top of the sheet
export const GROUND = 684;            // where the soles stand
export const CX = 405;                // the figure's centre line
export const MOUTH_Y = 444;           // the mouth line
export const BRAD_R = 9.5;            // brad radius (round 2: 8.6)
const INSET = 2 * BRAD_R;             // brads two radii in from the torn outline (plus the rim, below)
const SH_Y = { l: 470, r: 472 };      // shoulders: 26–28 below the mouth line (round 2: 420 / 430)
export const SHOULDER = {
  l: [edgeX(KEEP, SH_Y.l)[0] + INSET + 2, SH_Y.l],
  r: [edgeX(KEEP, SH_Y.r)[1] - INSET - 2, SH_Y.r],
};
export const ARM = { D: 120, w0: 46, w1: 40, glove: 31.5 }; // shoulder to mitten centre (round 2: 164)
export const REST = { armL: 122, armR: 58 };               // relaxed: the mittens beside the hips
export const BODY_PIVOT = [404, 578];                       // bottom centre: tilt and squash
export const FACE_CENTER = [388, 420];
export const HIPS = { l: [358, 552], r: [444, 556] };
export const LEG_LEN = { l: 114, r: 110 };
export const DECO_PIVOT = [372, 268];  // the fringe's root, under the clip

// ---------------------------------------------------------------- pieces
function scribbleLine(x0, y0, w, seed, h = 4.2) {
  const r = rng(seed);
  const pts = [];
  let x = x0, t = 0;
  while (x < x0 + w) {
    const loop = r() < 0.25 ? 1.9 : 1;
    pts.push([x + Math.cos(t) * 2.2, y0 - Math.abs(Math.sin(t)) * h * loop + (r() - 0.5) * 1.2]);
    t += 0.9 + r() * 0.5; x += 2.2 + r() * 1.6;
    if (r() < 0.13) { x += 7; pts.push(null); }
  }
  const runs = []; let cur = [];
  for (const p of pts) { if (p) cur.push(p); else { if (cur.length > 2) runs.push(cur); cur = []; } }
  if (cur.length > 2) runs.push(cur);
  return runs.map(run => smoothPath(run)).map(d => `<path d="${d}"/>`).join('');
}

function brad(x, y, r = BRAD_R) {
  return `<g><circle cx="${fmt(x + 1.3)}" cy="${fmt(y + 2)}" r="${fmt(r + 0.6)}" fill="oklch(28% 0.03 55)" opacity="0.3" filter="url(#${F}crayon-soft)"/>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fill('brass')} filter="url(#${F}metal)"/>
      <path d="M${fmt(x + r * 0.95)},${fmt(y - r * 0.2)} A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x - r * 0.35)},${fmt(y + r * 0.93)}" fill="none" ${stroke('brassDeep')} stroke-width="1.7" stroke-linecap="round" opacity="0.85" filter="url(#${F}graphite)"/>
      <ellipse cx="${fmt(x - r * 0.32)}" cy="${fmt(y - r * 0.36)}" rx="${fmt(r * 0.34)}" ry="${fmt(r * 0.24)}" transform="rotate(-30 ${fmt(x - r * 0.32)} ${fmt(y - r * 0.36)})" ${fill('brassHi')} opacity="0.9"/></g>`;
}

// The torso: the sheet with its belly fold and pencil shading, the writing under the dog-ear, the dog-ear
// (s = 1 folded flat, white back up; 0 on edge; −1 laid open, coloured front up), its crease, and the two
// brads that pin the arm strips from the front (the strips themselves are tucked behind the sheet).
export function torso(I, { flapS = 1 } = {}) {
  const hatches = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17, ang = -0.05 + t * 1.6;
    const cx = 405 + Math.cos(ang) * 152, cy = 412 + Math.sin(ang) * 170;
    hatches.push([[cx - 5, cy - 18], [cx + 6, cy + 8]]);
  }
  const hatchD = hatches.map((h, i) => pencil(h, 300 + i, 1, 0.6)[0]).map(d => `<path d="${d}"/>`).join('');
  let ink = '';
  for (let k = 0; k < 10; k++) ink += scribbleLine(444 + (k % 3) * 4, 270 + k * 12, 126 - (k % 2) * 10, 170 + k, 3.6);
  const s = flapS, showBack = s > 0;
  const flapT = s === 1 ? '' : ` transform="translate(${A[0]} ${A[1]}) rotate(${fmt(THETA)}) scale(1 ${s}) rotate(${fmt(-THETA)}) translate(${-A[0]} ${-A[1]})"`;
  const crease = pencil([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B], 404, 2, 0.6).map(d => `<path d="${d}"/>`).join('');
  return `<path d="${BODY_D}" ${fill('body')} filter="url(#${F}paper)"/>
    <clipPath id="${I}bodyclip"><path d="${BODY_D}"/></clipPath>
    <g clip-path="url(#${I}bodyclip)" ${stroke('graphite')} stroke-width="1.2" opacity="0.17" fill="none" filter="url(#${F}graphite)">${hatchD}</g>
    <g clip-path="url(#${I}bodyclip)">
      <path d="M230,504 L600,482 L600,640 L230,640Z" fill="oklch(40% 0.04 140)" opacity="0.05"/>
      <path d="M230,504 L600,482" stroke="oklch(97% 0.015 100)" stroke-width="2" opacity="0.5" filter="url(#${F}graphite)"/>
      <path d="M230,506.5 L600,484.5" stroke="oklch(40% 0.04 140)" stroke-width="1" opacity="0.13"/>
    </g>
    <clipPath id="${I}noteclip"><path d="${FLAP_D}"/></clipPath>
    <g clip-path="url(#${I}bodyclip)"><g clip-path="url(#${I}noteclip)">
      <g ${stroke('graphite')} stroke-width="${s === 1 ? 1.2 : 1.5}" fill="none" opacity="${s === 1 ? 0.62 : 0.8}" stroke-linecap="round" filter="url(#${F}graphite)" transform="rotate(-3 500 320)">${ink}</g>
    </g></g>
    ${showBack ? '' : `<g transform="translate(6 10)"><g${flapT}><path d="${FLAP_D}" fill="oklch(28% 0.03 55)" opacity="0.22" filter="url(#${F}crayon)"/></g></g>`}
    <g${flapT}>
      ${showBack ? `<path d="${FLAP_D}" fill="oklch(28% 0.03 55)" opacity="${s === 1 ? 0.22 : 0.3}" transform="translate(${s === 1 ? '3 6' : '5 9'})" filter="url(#${F}crayon)"/>
      <path d="${FLAP_D}" ${fill('back')} filter="url(#${F}paper)"/>` : `<path d="${FLAP_D}" ${fill('body')} filter="url(#${F}paper)"/>
      <path d="${FLAP_D}" fill="oklch(99% 0.01 90)" opacity="0.16"/>`}
    </g>
    <g ${stroke('graphite')} stroke-width="1.6" fill="none" opacity="${s === 1 ? 0.38 : 0.45}" stroke-linecap="round" filter="url(#${F}graphite)">${crease}</g>
    ${brad(...SHOULDER.l)}
    ${brad(...SHOULDER.r)}`;
}

// A strip from S to E (widths w0 → w1, a slight bend), the shoulder end rounded (the brad goes through it)
function stripPts(S, E, w0, w1, bend, capEnd, step = 4) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const ux = (E[0] - S[0]) / L, uy = (E[1] - S[1]) / L, nx = -uy, ny = ux;
  const m = Math.max(4, Math.round(L / step));
  const Cc = t => { const b = Math.sin(Math.PI * t) * bend; return [S[0] + ux * L * t + nx * b, S[1] + uy * L * t + ny * b]; };
  const W = t => (w0 + (w1 - w0) * t) / 2;
  const pts = [];
  for (let i = 0; i <= m; i++) { const t = i / m, c = Cc(t), w = W(t); pts.push([c[0] + nx * w, c[1] + ny * w]); }
  if (capEnd) {
    for (let k = 1; k < 8; k++) { const a = Math.PI / 2 - (k / 8) * Math.PI; pts.push([E[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w1 / 2, E[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w1 / 2]); }
  } else pts.push([E[0] + ux * 3, E[1] + uy * 3]);
  for (let i = m; i >= 0; i--) { const t = i / m, c = Cc(t), w = W(t); pts.push([c[0] - nx * w, c[1] - ny * w]); }
  for (let k = 1; k < 9; k++) { const a = -Math.PI / 2 - (k / 9) * Math.PI; pts.push([S[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w0 / 2, S[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w0 / 2]); }
  return pts;
}

// An arm: a torn strip of the darker sage offcut, pinned by its brad, ending in the cream mitten. Its shape is
// built in the arm's own frame, so drawing it at any angle gives the same paper turned (the rig is drawn at rest;
// the concept bakes each pose so the glue shadow keeps falling down-right). The thumb sits on the outer side at
// rest (palm to the viewer), so a raised hand has its thumb toward the head, as a waving hand does.
export function arm(I, sk, angleDeg, { brad: withBrad = true } = {}) {
  const S = SHOULDER[sk];
  const { D, w0, w1, glove: R } = ARM;
  const a = angleDeg * D2R, ca = Math.cos(a), sa = Math.sin(a);
  const W = [S[0] + ca * (D - R * 0.5), S[1] + sa * (D - R * 0.5)];
  const G = [S[0] + ca * D, S[1] + sa * D];
  const seed = sk === 'l' ? 91 : 92, bend = sk === 'l' ? 2.5 : -2.5;
  const strip = tear(stripPts(S, W, w0, w1, bend, false), seed * 7, { jag: 0.55, wander: 1.8 });
  // one faint pencil line along the strip's lower edge at rest: a flat strip, not a tube
  const fs = sk === 'l' ? 1 : -1;
  const nx = -sa, ny = ca;
  const p = t => [S[0] + ca * D * t + nx * fs * (w0 / 2 - 4), S[1] + sa * D * t + ny * fs * (w0 / 2 - 4)];
  const lineD = pencil([p(0.3), p(0.55), p(0.74)], seed * 3, 1, 0.5)[0];
  // the mitten: a round mitt and a thumb lobe, their union traced by rays from the centre, a torn V between them
  const ts = sk === 'l' ? 1 : -1;
  const mitt = { cx: R * 0.06, cy: -ts * R * 0.05, a: R * 1.0, b: R * 0.9, rot: 0 };
  const thumb = { cx: -R * 0.04, cy: ts * R * 0.88, a: R * 0.52, b: R * 0.37, rot: ts * 0.62 };
  const hit = (e, dx, dy) => {
    const c = Math.cos(e.rot), s = Math.sin(e.rot);
    const ox = (-e.cx) * c + (-e.cy) * s, oy = -(-e.cx) * s + (-e.cy) * c;
    const vx = dx * c + dy * s, vy = -dx * s + dy * c;
    const A2 = vx * vx / (e.a * e.a) + vy * vy / (e.b * e.b), B2 = 2 * (ox * vx / (e.a * e.a) + oy * vy / (e.b * e.b)), C2 = ox * ox / (e.a * e.a) + oy * oy / (e.b * e.b) - 1;
    const disc = B2 * B2 - 4 * A2 * C2;
    return disc < 0 ? 0 : Math.max(0, (-B2 + Math.sqrt(disc)) / (2 * A2));
  };
  const N = 140, raw = [];
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * Math.PI * 2 - Math.PI, dx = Math.cos(ph), dy = Math.sin(ph);
    const rm = hit(mitt, dx, dy), rt = hit(thumb, dx, dy);
    raw.push({ ph, r: Math.max(rm, rt), thumb: rt > rm });
  }
  let phJ = null;
  for (let i = 0; i < N; i++) {
    const p0 = raw[i], p1 = raw[(i + 1) % N];
    const near = ts > 0 ? (!p0.thumb && p1.thumb) : (p0.thumb && !p1.thumb);
    if (near && Math.abs(p0.ph) < Math.PI / 1.4) phJ = ts > 0 ? p1.ph : p0.ph;
  }
  const toWorld = (fx, fy) => [G[0] + ca * fx - sa * fy, G[1] + sa * fx + ca * fy];
  let notchR = R;
  const pts = raw.map(({ ph, r }) => {
    if (phJ !== null) {
      const d = Math.abs(Math.atan2(Math.sin(ph - phJ), Math.cos(ph - phJ)));
      const cut = R * 0.27 * Math.max(0, 1 - d / 0.15);
      if (d < 0.01) notchR = r - cut;
      r -= cut;
    }
    return toWorld(Math.cos(ph) * r, Math.sin(ph) * r);
  });
  const g = tear(pts, seed + 400, { jag: 0.22, wander: 0.9 });
  // the thumb's seam: a short pencil line from the bottom of the V back into the mitten
  const nb = [Math.cos(phJ) * (notchR - 1), Math.sin(phJ) * (notchR - 1)];
  const seam = [nb, [nb[0] * 0.55 - R * 0.12, nb[1] * 0.62 + ts * R * 0.02], [-R * 0.3, ts * R * 0.42]].map(q => toWorld(...q));
  const seamD = pencil(seam, seed + 77, 2, 0.35).map(d => `<path d="${d}"/>`).join('');
  return `<path d="${path(strip)}" ${fill('arm')} filter="url(#${F}strip)"/>
    <g ${stroke('graphite')} stroke-width="1" opacity="0.2" fill="none" stroke-linecap="round" filter="url(#${F}graphite)"><path d="${lineD}"/></g>
    <path d="${path(g)}" ${fill('glove')} filter="url(#${F}thin)"/>
    <g ${stroke('graphite')} stroke-width="1.3" opacity="0.42" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${seamD}</g>
    ${withBrad ? brad(...S) : ''}`;
}
// where a mitten's centre lands for an arm angle (in Tuck's coordinates, before any body tilt)
export const mittenAt = (sk, angleDeg) => [SHOULDER[sk][0] + Math.cos(angleDeg * D2R) * ARM.D, SHOULDER[sk][1] + Math.sin(angleDeg * D2R) * ARM.D];

// An accordion leg from the hip, with its foot (one part). squash stretches the folds about the hip.
export function leg(sk, { squash = 1, lean } = {}) {
  const [hx, hy] = HIPS[sk], len = LEG_LEN[sk];
  const seed = sk === 'l' ? 5 : 9, flip = sk === 'l' ? 1 : -1;
  lean = lean ?? (sk === 'l' ? -8 : 14);
  const r = rng(seed);
  const panels = 7, zig = 7, w = 28, ph = len / panels;
  const folds = [];
  for (let i = 0; i <= panels; i++) {
    const t = i / panels;
    const cx = hx + lean * t + (i % 2 ? zig : -zig) * flip * (i === 0 ? 0.3 : 1);
    const cy = hy + i * ph, tilt = (r() - 0.5) * 3;
    folds.push([[cx - w / 2, cy - tilt], [cx + w / 2, cy + tilt]]);
  }
  let s = '';
  for (let i = 0; i < panels; i++) {
    const [a, b] = folds[i], [c, d] = folds[i + 1];
    s += `<path d="${path(tear(poly([a, b, d, c], 4.5), seed * 10 + i, { jag: 0.8, wander: 2 }))}" ${fill(i % 2 ? 'legA' : 'legB')}/>`;
  }
  let lines = '';
  for (let i = 1; i < panels; i++) {
    const [a, b] = folds[i];
    lines += pencil([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.6], b], seed + i, 2, 0.5).map(d => `<path d="${d}"/>`).join('');
  }
  const end = folds[panels];
  const bx = (end[0][0] + end[1][0]) / 2, by = end[0][1];
  const fx = bx + 6 * flip, fy = by + 6;
  const foot = tear(spline([[fx - 26, fy + 2], [fx - 10, fy - 9], [fx + 16, fy - 8], [fx + 28, fy + 3], [fx + 12, fy + 11], [fx - 16, fy + 10]], 5), seed + 50, { jag: 1, wander: 3 });
  const dy = (squash - 1) * len;
  const legT = squash === 1 ? '' : ` transform="translate(${fmt(hx)} ${fmt(hy)}) scale(1 ${squash}) translate(${fmt(-hx)} ${fmt(-hy)})"`;
  return `<g${legT}><g filter="url(#${F}paper)">${s}</g>
      <g ${stroke('graphite')} stroke-width="1.1" stroke-opacity="0.45" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${lines}</g></g>
    <path d="${path(foot)}" ${fill('bodyDeep')} filter="url(#${F}paper)"${dy ? ` transform="translate(0 ${fmt(dy)})"` : ''}/>`;
}
export const SOLE = { l: GROUND, r: GROUND };

// The head decoration (round 3): a side-swept fringe — three torn locks of the legs' wheat paper laid over the
// sheet's top and falling down its left side, pointed at the tips — held back by a brass paper clip (the brads'
// brass) like a child's hair clip on its bangs. Three locks of two shades all falling one way: at 48 px it reads
// as hair with a clip on it, never as a single upright prong (an ear), a crest, or leaves (it is not green).
function lock(ctrl, w0, seed, tipW = 1.5) {
  const sp = spline(ctrl, 3, false);
  const n = sp.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = i / (n - 1), w = (w0 * Math.pow(1 - t, 0.7) + tipW * t) / 2;
    L.push([sp[i][0] - ty * w, sp[i][1] + tx * w]); Rr.push([sp[i][0] + ty * w, sp[i][1] - tx * w]);
  }
  return { outline: tear([...L, ...Rr.reverse()], seed, { jag: 0.45, wander: 1.2 }), spine: sp };
}
export const LOCKS = [ // spine control points (root under the clip → tip), root width, paper; tips fan out, pointing down
  { c: [[396, 257], [344, 249], [296, 272], [266, 312], [255, 330]], w: 27, k: 'hairLight', seed: 64 },
  { c: [[392, 264], [346, 264], [310, 292], [296, 332]], w: 25, k: 'hair', seed: 65 },
  { c: [[390, 271], [356, 282], [334, 310], [330, 342]], w: 23, k: 'hairLight', seed: 66 },
  { c: [[388, 278], [370, 298], [364, 326]], w: 19, k: 'hair', seed: 67 },
];
export const CLIP = { cx: 372, cy: 266, ang: -8, scale: 1.2 };
export function deco() {
  const ls = LOCKS.map(l => ({ ...l, ...lock(l.c, l.w, l.seed) }));
  const locks = ls.map(l => `<path d="${path(l.outline)}" ${fill(l.k)} filter="url(#${F}thin)"/>`).join('');
  // a pencil line down each lock: torn paper strips, not leaves or flames
  const veins = ls.map((l, i) => { const n = l.spine.length; return pencil([0.3, 0.55, 0.78].map(t => l.spine[Math.round(t * (n - 1))]), 700 + i, 1, 0.4)[0]; })
    .map(d => `<path d="${d}"/>`).join('');
  const gem = 'M-5,2 L12,2 A2,2 0 0 0 12,-2 L-17,-2 A4,4 0 0 0 -17,6 L18,6 A6,6 0 0 0 18,-6 L-8,-6';
  return `${locks}
    <g ${stroke('graphite')} stroke-width="0.9" opacity="0.2" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${veins}</g>
    <g transform="translate(${CLIP.cx} ${CLIP.cy}) rotate(${CLIP.ang}) scale(${CLIP.scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${gem}" stroke="oklch(28% 0.03 55)" stroke-width="3.2" opacity="0.28" transform="translate(1 1.8)" filter="url(#${F}crayon-soft)"/>
      <g filter="url(#${F}metal)">
        <path d="${gem}" ${stroke('brassDeep')} stroke-width="3.6"/>
        <path d="${gem}" ${stroke('brass')} stroke-width="2.2"/>
      </g>
      <path d="${gem}" ${stroke('brassHi')} stroke-width="0.7" opacity="0.75" transform="translate(-0.4 -0.5)"/>
    </g>`;
}

// ---------------------------------------------------------------- the face (round 2's, unchanged)
export const EYES = { l: { cx: 340, cy: 396, rx: 10.5, ry: 13.5, seed: 71, tilt: -0.08 }, r: { cx: 433, cy: 394, rx: 9.8, ry: 12.8, seed: 72, tilt: 0.1 } };
export function eye(sk, { closed = false, look = [0, 0] } = {}) {
  const { cx, cy, rx, ry, seed, tilt } = EYES[sk];
  const pencilG = (pts, sw, s2, op = 1) => `<g ${stroke('graphite')} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#${F}graphite)">${pencil(pts, s2, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
  if (closed) return pencilG([[cx - rx * 1.25, cy + 4], [cx - rx * 0.55, cy - ry * 0.45], [cx + rx * 0.55, cy - ry * 0.45], [cx + rx * 1.25, cy + 4]], 3, seed);
  const x = cx + look[0], y = cy + look[1];
  const oval = tear(ellipse(x, y, rx, ry, 22, tilt), seed, { jag: 0.25, wander: 0.5 });
  const ring = [...oval, oval[0], oval[1]];
  return `<path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#${F}graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.5" fill="none" opacity="0.7" filter="url(#${F}graphite)">${pencil(ring, seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
    <ellipse cx="${fmt(x - rx * 0.34)}" cy="${fmt(y - ry * 0.36)}" rx="${fmt(rx * 0.32)}" ry="${fmt(ry * 0.27)}" ${fill('glint')} opacity="0.92"/>`;
}
export function mouth(kind = 'smile') {
  if (kind === 'o') return `<ellipse cx="388" cy="444" rx="5" ry="6.2" ${fill('graphite')} opacity="0.9" filter="url(#${F}graphite-fill)"/>`;
  if (kind === 'open') return `<path d="M377,439 Q388,443 399,439 Q397,455 388,455 Q379,455 377,439Z" ${fill('graphite')} opacity="0.9" filter="url(#${F}graphite-fill)"/>`;
  const pts = { smile: [[377, 440], [384, 446], [393, 446], [399, 440]], soft: [[379, 444], [388, 447], [397, 443]] }[kind];
  return `<g ${stroke('graphite')} stroke-width="2.3" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${pencil(pts, 17, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
}
export function cheeks(opacity = 0.65) {
  const hatch = (cx, cy, seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 10 + i * 9.5; d += pencil([[x - 4.5, cy + 8], [x + 4.5, cy - 8]], seed + i, 2, 0.6).map(q => `<path d="${q}"/>`).join(''); }
    return `<g ${stroke('blush')} stroke-width="4" fill="none" stroke-linecap="round" filter="url(#${F}crayon)">${d}</g>`;
  };
  return `<g opacity="${opacity}">${hatch(320, 428, 501)}${hatch(456, 426, 511)}</g>`;
}
export const shadow = () => `<ellipse cx="404" cy="${GROUND + 5}" rx="122" ry="12" fill="${C.graphite}" opacity="0.1" filter="url(#${F}crayon)"/>`;

// ---------------------------------------------------------------- a posed copy (concept sheet)
export function figure(I, pose = {}) {
  const o = { armL: REST.armL, armR: REST.armR, tilt: 0, squashL: 1, squashR: 1, leanL: undefined, leanR: undefined, flapS: 1, look: [0, 0],
    eyes: 'open', mouth: 'smile', blush: 0.65, lift: 0, decoRot: 0, shadow: true, ...pose };
  const closed = o.eyes === 'shut';
  return `<g>
  ${o.shadow ? shadow() : ''}
  <g transform="translate(0 ${-o.lift})">
  ${leg('l', { squash: o.squashL, lean: o.leanL })}
  ${leg('r', { squash: o.squashR, lean: o.leanR })}
  <g transform="rotate(${o.tilt} ${BODY_PIVOT[0]} ${BODY_PIVOT[1]})">
    ${arm(I, 'l', o.armL)}
    ${arm(I, 'r', o.armR)}
    ${torso(I, { flapS: o.flapS })}
    <g transform="rotate(${o.decoRot} ${DECO_PIVOT[0]} ${DECO_PIVOT[1]})">${deco()}</g>
    <g transform="translate(${o.look[0]} ${o.look[1]})">
      ${cheeks(o.blush)}
      ${eye('l', { closed })}
      ${eye('r', { closed })}
      ${mouth(o.mouth)}
    </g>
  </g>
  </g>
</g>`;
}
// The main pose ("hi"): the viewer's-left arm raised and waving, the sheet leaning a little the other way,
// the left foot lifted. The raised mitten clears the sheet's outline beside its upper half.
export const MAIN = { armL: -117, armR: 64, tilt: 3, squashL: 0.86, look: [2, -1] };

// ---------------------------------------------------------------- the rig (kit.md "Rig contract")
export const S = 420 / (GROUND - TOP);
const toRig = ([x, y]) => [350 + (x - CX) * S, 700 + (y - GROUND) * S];
const R2 = p => toRig(p).map(v => v.toFixed(1)).join(' ');
export function rig() {
  const wrap = inner => `<g transform="translate(350 700) scale(${S.toFixed(5)}) translate(${-CX} ${-GROUND})">${inner}</g>`;
  const part = (name, parent, pivot, inner, extra = '') => ` <g data-part="${name}" data-parent="${parent}" data-pivot="${R2(pivot)}"${extra}>${wrap(inner)}</g>`;
  const ft = toRig(FACE_CENTER);
  const parts = [
    part('shadow', 'root', [CX, GROUND], shadow()),
    part('leg-l', 'root', HIPS.l, leg('l'), ` data-len="${((SOLE.l - HIPS.l[1]) * S).toFixed(1)}"`),
    part('leg-r', 'root', HIPS.r, leg('r'), ` data-len="${((SOLE.r - HIPS.r[1]) * S).toFixed(1)}"`),
    // arms are painted behind the sheet: their strips tuck under its edge; each carries its own brad (under the
    // sheet, at the pivot) and the torso shows the brad heads on its face
    part('arm-l', 'body', SHOULDER.l, arm('tk-al-', 'l', REST.armL), ` data-angle="${REST.armL}"`),
    part('arm-r', 'body', SHOULDER.r, arm('tk-ar-', 'r', REST.armR), ` data-angle="${REST.armR}"`),
    part('torso', 'body', BODY_PIVOT, torso('tk-t-')),
    part('torso-alt', 'body', BODY_PIVOT, torso('tk-ta-', { flapS: 0.28 }), ' data-variant-of="torso"'),
    part('deco', 'body', DECO_PIVOT, deco()),
    part('cheeks', 'face', [388, 427], cheeks()),
    part('eye-l', 'face', [EYES.l.cx, EYES.l.cy], eye('l')),
    part('eye-r', 'face', [EYES.r.cx, EYES.r.cy], eye('r')),
    part('eye-l-shut', 'face', [EYES.l.cx, EYES.l.cy], eye('l', { closed: true }), ' data-variant-of="eye-l"'),
    part('eye-r-shut', 'face', [EYES.r.cx, EYES.r.cy], eye('r', { closed: true }), ' data-variant-of="eye-r"'),
    part('mouth', 'face', [388, 444], mouth('smile')),
    part('mouth-o', 'face', [388, 444], mouth('o'), ' data-variant-of="mouth"'),
    part('mouth-open', 'face', [388, 446], mouth('open'), ' data-variant-of="mouth"'),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 760" width="700" height="760">
<!-- 摺摺 Tuck · round 3 rig (kit.md "Rig contract"). Series units: ground y=700, centre x=350, sheet top ${(700 - 420).toFixed(0)} (data-height 420).
     Drawn in Tuck's own coordinates and scaled by ${S.toFixed(4)} inside each part; every data-pivot is in rig units.
     Arms are painted behind the torso (their strips tuck under the sheet's edge); the torso carries the visible brad heads,
     and each arm also carries its own brad at its pivot (hidden under the sheet), so arm and brad stay one part. -->
${defs()}
<g data-rig data-name="摺摺 Tuck" data-prefix="tk-" data-ground="350 700" data-face-center="${ft.map(v => v.toFixed(1)).join(' ')}" data-height="420" data-walk="walk">
${parts.join('\n')}
</g>
</svg>`;
}

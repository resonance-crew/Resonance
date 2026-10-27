// 聆聆 Nod — round 3, the 摺摺 series: a lavender index card in landscape, cut from card stock, with one terracotta
// header rule, faint printed lines and a few words of somebody's pencil handwriting. Brass brads below its mouth line,
// set inside the card's edge, pin two strips of a deeper lavender offcut that end in the family's cream mittens. Short
// stubby folded-card legs, torn plum soles, and a deep teal construction-paper beret worn to the right.
//
// Everything is drawn in the series' rig units (kit.md "Rig contract"): viewBox 0 0 700 760, ground y = 700,
// centred on x = 350. Each part builder returns plain SVG in those units; build.mjs wraps them as rig parts or poses
// them for the concept sheet. Filters are Tuck's round-2 recipes copied under the cd- prefix (a cut, not torn,
// card stock edge gets a smaller displacement).
import { rng, spline, poly, tear, path, smoothPath, pencil, ellipse } from './lib.mjs';

export const P = 'cd-';

// Every paper colour is a custom property with its day value as the fallback (--cd-card, …).
export const C = {
  card: 'oklch(84% 0.046 292)',       // lavender index card, front
  offcut: 'oklch(67% 0.056 293)',     // a deeper lavender offcut: arms and legs
  offcutFold: 'oklch(60.5% 0.06 295)', // the leg's lower, folded-back panel
  foot: 'oklch(50% 0.052 300)',       // plum soles
  glove: 'oklch(93% 0.026 86)',       // the family's cream mitten paper
  brass: 'oklch(73% 0.085 82)',
  brassDeep: 'oklch(50% 0.06 68)',
  brassHi: 'oklch(94% 0.035 92)',
  rule: 'oklch(62% 0.14 45)',         // terracotta header rule (the only terracotta besides the blush)
  lines: 'oklch(60% 0.06 255)',       // the card's faint printed lines
  beret: 'oklch(52% 0.06 195)',       // deep teal construction paper
  beretBand: 'oklch(42% 0.05 200)',   // its band, a darker teal strip
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(69% 0.1 38)',
  rim: 'oklch(97.5% 0.012 85)',
};
const VAR = { card: 'card', offcut: 'offcut', offcutFold: 'offcut-fold', foot: 'foot', glove: 'glove', brass: 'brad', brassDeep: 'brad-rim', brassHi: 'brad-glint', rule: 'rule', lines: 'lines', beret: 'beret', beretBand: 'beret-band', graphite: 'ink', glint: 'glint', blush: 'blush' };
const fill = (k, v) => `style="fill:${v || `var(--cd-${VAR[k]}, ${C[k]})`}"`;
const stroke = (k, v) => `style="stroke:${v || `var(--cd-${VAR[k]}, ${C[k]})`}"`;
const fmt = n => n.toFixed(1);
const D2R = Math.PI / 180;

// Shared geometry (rig units). One set of numbers for the rig and every pose on the concept sheet.
export const G = {
  ground: 700, cx: 350,
  card: { x0: 140, x1: 560, y0: 364, y1: 632 },  // 420 × 268: about 1.4× Tuck's width; top 336 above the ground (0.8×)
  header: 402,                                     // the terracotta rule
  lines: [428, 451, 474, 497, 520, 543, 566, 589, 612],
  eyeL: [296, 434], eyeR: [404, 434],
  mouth: [350, 460],
  cheekL: [273, 455], cheekR: [427, 455],
  face: [350, 447],
  // shoulders: brass brads 18 units (≈ 2.1 brad radii) inside the card's side edges, 34 below the mouth line
  bradL: [158, 494], bradR: [542, 494], bradR_: 8.5,
  arm: { D: 106, w0: 36, w1: 31, glove: 24, restL: 120, restR: 62 },
  hipL: [300, 622], hipR: [400, 622], legLen: 78,
  decoPivot: [318, 371],                           // the beret's left brim end: a hat-tip turns it about here
};

export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-400" y="-400" width="2400" height="1800"';
  return `<defs>
  <!-- card stock, cut with scissors: Tuck's torn-paper recipe with a much smaller displacement (cut, not torn), the white fibre rim, the glue shadow down-right, mottle and specks -->
  <filter id="cd-card" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="17" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.6" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="8" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="1.8" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.29  0 0 0 0 0.36  4 0 0 0 -2.9" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.98  0.34 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- torn paper (the offcut strips' and soles' torn edges): Tuck's recipe as it was -->
  <filter id="cd-paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.28  0 0 0 0 0.34  4 0 0 0 -2.86" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.98  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- construction paper for the beret: a cut edge with a soft fuzz, the rim and shadow, a stronger mottle, no specks -->
  <filter id="cd-felt" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" seed="27" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.5" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="28" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.4" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2.6" result="blur"/><feOffset dx="2.2" dy="4" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="3" seed="29" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 0.98  0 0 0 0 0.9  0.42 0 0 0 -0.16" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="30" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.26  0 0 0 0 0.12  2.6 0 0 0 -1.6" result="grain"/>
    <feComposite in="grain" in2="torn" operator="in" result="grains"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="grains"/></feMerge>
  </filter>
  <!-- thin paper (the mittens): same tear, a fainter shadow, a narrower rim, no specks -->
  <filter id="cd-thin" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.3" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.4" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2" result="blur"/><feOffset dx="1.5" dy="3" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.18"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.45 0 0 0 -0.2" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- graphite: a pencil line that skips over the tooth of the paper -->
  <filter id="cd-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- print: the card's own printed rules, steadier than a pencil, still broken a little by the stock's tooth -->
  <filter id="cd-print" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="1" seed="12" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="16" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.85" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- graphite fill: a pencil-filled shape, denser than a line, still a little grainy at the edge -->
  <filter id="cd-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- crayon: soft waxy blush with gaps -->
  <filter id="cd-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <!-- a softer crayon for small shadows (the brad's) -->
  <filter id="cd-crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <!-- brass: a matte brad head, a little uneven, with a faint grain -->
  <filter id="cd-metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
</defs>`;
}

// ---------------------------------------------------------------------------------------------------------------
// pencil helpers
const pen = (pts, seed, { sw = 1.2, op = 0.5, passes = 2, spread = 0.5, color } = {}) =>
  `<g ${stroke('graphite', color)} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#cd-graphite)">${pencil(pts, seed, passes, spread).map(d => `<path d="${d}"/>`).join('')}</g>`;

// Cursive-looking pencil loops (not letters): somebody's handwriting. y0 is the baseline.
export function scribbleLine(x0, y0, w, seed, h = 6.5) {
  const r = rng(seed);
  const pts = [];
  let x = x0, t = 0;
  while (x < x0 + w) {
    const loop = r() < 0.25 ? 1.8 : 1;
    pts.push([x + Math.cos(t) * 2, y0 - Math.abs(Math.sin(t)) * h * loop + (r() - 0.5) * 1.1]);
    t += 0.9 + r() * 0.5; x += 2.1 + r() * 1.5;
    if (r() < 0.12) { x += 7; pts.push(null); }
  }
  const runs = []; let cur = [];
  for (const p of pts) { if (p) cur.push(p); else { if (cur.length > 2) runs.push(cur); cur = []; } }
  if (cur.length > 2) runs.push(cur);
  return runs.map(run => smoothPath(run)).map(d => `<path d="${d}"/>`).join('');
}

// ---------------------------------------------------------------------------------------------------------------
// the card: a rounded landscape rectangle cut by hand — four slightly different corners, a top edge that slopes
// 2 units and bows a little, sides that are not quite straight — so it reads as a card somebody cut, never an icon
export function cardOutline(seed = 41) {
  const { x0, x1, y0, y1 } = G.card;
  const r = { tl: 25, tr: 20, br: 27, bl: 21 };
  const W = x1 - x0;
  const topY = x => y0 - 1 + (x - x0) / W * 2 - Math.sin(Math.PI * (x - x0) / W) * 1.6;
  const botY = x => y1 + Math.sin(Math.PI * (x - x0) / W) * 1.2;
  const sideX = (y, base, dir) => base + dir * Math.sin(Math.PI * (y - y0) / (y1 - y0)) * 1.1;
  const pts = [];
  const arc = (cx, cy, rad, a0, a1) => { const n = 8; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } };
  arc(x0 + r.tl, topY(x0) + r.tl, r.tl, 180, 270);
  for (let x = x0 + r.tl + 6; x < x1 - r.tr - 3; x += 6) pts.push([x, topY(x)]);
  arc(x1 - r.tr, topY(x1) + r.tr, r.tr, 270, 360);
  for (let y = topY(x1) + r.tr + 6; y < y1 - r.br - 3; y += 6) pts.push([sideX(y, x1, 1), y]);
  arc(x1 - r.br, y1 - r.br, r.br, 0, 90);
  for (let x = x1 - r.br - 6; x > x0 + r.bl + 3; x -= 6) pts.push([x, botY(x)]);
  arc(x0 + r.bl, y1 - r.bl, r.bl, 90, 180);
  for (let y = y1 - r.bl - 6; y > topY(x0) + r.tl + 3; y -= 6) pts.push([sideX(y, x0, -1), y]);
  return tear(pts, seed, { amp: 0.5, jag: 0.3, wander: 1.2 });
}

// where somebody wrote on it: a title on the header, and (rest) a few words low on the right and left
const WRITING = {
  rest: [[168, 395, 92, 701, 8], [384, 541, 120, 702], [384, 564, 66, 703], [196, 587, 58, 704]],
};
// torso-alt: after a story, every line is written full, flowing round the face
WRITING.alt = (() => {
  const out = [[168, 395, 150, 711, 8], [338, 395, 58, 712, 8]];
  G.lines.forEach((y, i) => {
    const r = rng(800 + i);
    const segs = y < 482 ? [[168, 258 - r() * 14], [444 + r() * 6, 532 - r() * 10]] : [[168 + (i % 3 === 0 ? 14 : 0), 532 - r() * 40]];
    segs.forEach(([a, b], k) => out.push([a, y - 2, b - a, 720 + i * 7 + k]));
  });
  return out;
})();

export function torso(inst = '', { alt = false } = {}) {
  const outline = cardOutline();
  const d = path(outline);
  const cid = `${P}${inst}${alt ? 'alt-' : ''}card-clip`;
  const { x0, x1 } = G.card;
  const rl = rng(alt ? 61 : 60);
  const ruled = G.lines.map(y => { const pts = []; for (let x = x0 - 6; x <= x1 + 6; x += 35) pts.push([x, y + (rl() - 0.5) * 0.7]); return `<path d="${smoothPath(pts)}"/>`; }).join('');
  const hp = []; for (let x = x0 - 6; x <= x1 + 6; x += 30) hp.push([x, G.header + (rl() - 0.5) * 0.8]);
  const header = `<path d="${smoothPath(hp)}"/>`;
  const writing = (alt ? WRITING.alt : WRITING.rest).map(([x, y, w, s, h]) => scribbleLine(x, y, w, s, h ?? 6.4)).join('');
  // a faint pencil shading along the lower right: a flat card, held a little curved
  return `<path d="${d}" ${fill('card')} filter="url(#cd-card)"/>
    <clipPath id="${cid}"><path d="${d}"/></clipPath>
    <g clip-path="url(#${cid})">
      <g ${stroke('lines')} stroke-width="1.25" opacity="0.36" fill="none" filter="url(#cd-print)">${ruled}</g>
      <g ${stroke('rule')} stroke-width="2.6" opacity="0.9" fill="none" filter="url(#cd-print)">${header}</g>
      <g ${stroke('graphite')} stroke-width="1.1" opacity="${alt ? 0.5 : 0.55}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#cd-graphite)">${writing}</g>
    </g>`;
}

// ---------------------------------------------------------------------------------------------------------------
// the beret, cut from mustard construction paper: a band along the card's top edge and a soft crown that rides
// over it and droops past its right end. Worn to the right, so the right mitten can reach under its brim.
export function beret(inst = '') {
  // the band sits flat along the card's top edge; the crown puffs up left of centre, slopes down to the right and
  // slides over the card's top-right corner, its droop hanging past the edge: a beret worn to one side, sitting on the
  // card, never a lid. No nub on top (a single upright stub is what the series avoids)
  const crownKeys = [[300, 343], [310, 322], [336, 304], [376, 291], [428, 285], [480, 287], [526, 297], [562, 314], [588, 337], [602, 362], [601, 386], [590, 400], [575, 400], [561, 387], [541, 375], [500, 366], [440, 362], [380, 362], [336, 365], [312, 365], [301, 357]];
  const crown = tear(spline(crownKeys, 6), 91, { amp: 0.6, jag: 0.4, wander: 1.6 });
  const band = tear(poly([[318, 357], [548, 359], [554, 366], [550, 373], [430, 373], [320, 372], [314, 365]], 5), 92, { amp: 0.4, jag: 0.3, wander: 1 });
  const cid = `${P}${inst}beret-clip`;
  const folds = pen([[334, 320], [384, 304], [440, 299], [496, 305], [546, 324]], 93, { sw: 1.3, op: 0.26 })
    + pen([[568, 352], [586, 370], [592, 390]], 94, { sw: 1.2, op: 0.26 });
  const shade = [];
  for (let i = 0; i < 13; i++) { const t = i / 12, x = 470 + t * 128, y = 360 + t * t * 34 - Math.sin(t * Math.PI) * 10; shade.push(pencil([[x - 4, y + 8], [x + 4, y - 7]], 950 + i, 1, 0.4)[0]); }
  const stitches = [];
  for (let x = 330; x < 540; x += 11) stitches.push(pencil([[x, 367.5], [x + 5.5, 367.3]], 960 + x, 1, 0.25)[0]);
  return `<path d="${path(band)}" ${fill('beretBand')} filter="url(#cd-felt)"/>
    <g ${stroke('graphite')} stroke-width="1.1" opacity="0.32" fill="none" stroke-linecap="round" filter="url(#cd-graphite)">${stitches.map(s => `<path d="${s}"/>`).join('')}</g>
    <path d="${path(crown)}" ${fill('beret')} filter="url(#cd-felt)"/>
    <clipPath id="${cid}"><path d="${path(crown)}"/></clipPath>
    <g clip-path="url(#${cid})">${folds}<g ${stroke('graphite')} stroke-width="1.1" opacity="0.22" fill="none" filter="url(#cd-graphite)">${shade.map(s => `<path d="${s}"/>`).join('')}</g></g>`;
}

// ---------------------------------------------------------------------------------------------------------------
// face, drawn straight onto the card in graphite
export function eye(cx, cy, { rx = 9.5, ry = 12.5, look = [0, 0], seed = 1, closed = false, tilt = 0 } = {}) {
  if (closed) {
    // the happy, shut eye: a soft ∩ pencil arc
    const arc = [[cx - rx * 1.25, cy + 4], [cx - rx * 0.55, cy - ry * 0.42], [cx + rx * 0.55, cy - ry * 0.42], [cx + rx * 1.25, cy + 4]];
    return `<g ${stroke('graphite')} stroke-width="2.8" fill="none" stroke-linecap="round" filter="url(#cd-graphite)">${pencil(arc, seed, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
  }
  const x = cx + look[0], y = cy + look[1];
  const oval = tear(ellipse(x, y, rx, ry, 22, tilt), seed, { jag: 0.25, wander: 0.5 });
  const ring = [...oval, oval[0], oval[1]];
  return `<path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#cd-graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.4" fill="none" opacity="0.7" filter="url(#cd-graphite)">${pencil(ring, seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
    <ellipse cx="${fmt(x - rx * 0.34)}" cy="${fmt(y - ry * 0.36)}" rx="${fmt(rx * 0.32)}" ry="${fmt(ry * 0.27)}" ${fill('glint')} opacity="0.92"/>`;
}
export const eyeL = (o = {}) => eye(...G.eyeL, { rx: 9.6, ry: 12.6, seed: 71, tilt: -0.08, ...o });
export const eyeR = (o = {}) => eye(...G.eyeR, { rx: 9.1, ry: 12.1, seed: 72, tilt: 0.1, ...o });

export function mouth(kind = 'smile') {
  const [mx, my] = G.mouth;
  if (kind === 'o') return `<ellipse cx="${mx}" cy="${my + 1}" rx="4.6" ry="5.8" ${fill('graphite')} opacity="0.9" filter="url(#cd-graphite-fill)"/>`;
  if (kind === 'open') {
    // a small open smile: a pencil-filled D, no tongue
    const pts = []; for (let i = 0; i <= 10; i++) { const t = Math.PI * i / 10; pts.push([mx + Math.cos(t) * 10, my - 3 + Math.sin(t) * 9]); }
    return `<path d="${smoothPath([[mx - 10, my - 3], ...pts.reverse(), [mx + 10, my - 3]], true)}" ${fill('graphite')} opacity="0.92" filter="url(#cd-graphite-fill)"/>`;
  }
  const shapes = {
    smile: [[mx - 11, my - 4], [mx - 5, my + 2], [mx + 5, my + 2], [mx + 11, my - 4]],
    soft: [[mx - 9, my - 1], [mx, my + 2], [mx + 9, my - 2]],
  };
  return `<g ${stroke('graphite')} stroke-width="2.2" fill="none" stroke-linecap="round" filter="url(#cd-graphite)">${pencil(shapes[kind], 17, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
}

// cheeks: Tuck's three short terracotta crayon strokes, a touch smaller
export function cheeks(opacity = 0.65) {
  const hatch = (cx, cy, seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 8.5 + i * 8.5; d += pencil([[x - 4, cy + 7], [x + 4, cy - 7]], seed + i, 2, 0.6).map(q => `<path d="${q}"/>`).join(''); }
    return `<g ${stroke('blush')} stroke-width="3.6" fill="none" stroke-linecap="round" filter="url(#cd-crayon)">${d}</g>`;
  };
  return `<g opacity="${opacity}">${hatch(...G.cheekL, 501)}${hatch(...G.cheekR, 511)}</g>`;
}

// ---------------------------------------------------------------------------------------------------------------
// an arm: a strip of the deeper offcut, rounded at the shoulder where a brass brad pins it to the card, tapering a
// little to the wrist, ending in the family's cream mitten with its thumb on the side that faces the body. The
// geometry is baked at the angle it is drawn at, so the glue shadow falls down-right.
function stripPts(S, E, w0, w1, bend, step = 4) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const ux = (E[0] - S[0]) / L, uy = (E[1] - S[1]) / L, nx = -uy, ny = ux;
  const m = Math.max(4, Math.round(L / step));
  const Cc = t => { const b = Math.sin(Math.PI * t) * bend; return [S[0] + ux * L * t + nx * b, S[1] + uy * L * t + ny * b]; };
  const Wd = t => (w0 + (w1 - w0) * t) / 2;
  const pts = [];
  for (let i = 0; i <= m; i++) { const t = i / m, c = Cc(t), w = Wd(t); pts.push([c[0] + nx * w, c[1] + ny * w]); }
  pts.push([E[0] + ux * 3, E[1] + uy * 3]);
  for (let i = m; i >= 0; i--) { const t = i / m, c = Cc(t), w = Wd(t); pts.push([c[0] - nx * w, c[1] - ny * w]); }
  for (let k = 1; k < 9; k++) { const a = -Math.PI / 2 - (k / 9) * Math.PI; pts.push([S[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w0 / 2, S[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w0 / 2]); }
  return pts;
}
function brad(x, y, r = G.bradR_) {
  return `<circle cx="${fmt(x + 1.3)}" cy="${fmt(y + 2)}" r="${fmt(r + 0.6)}" fill="oklch(28% 0.03 55)" opacity="0.28" filter="url(#cd-crayon-soft)"/>
    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fill('brass')} filter="url(#cd-metal)"/>
    <path d="M${fmt(x + r * 0.95)},${fmt(y - r * 0.2)} A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x - r * 0.35)},${fmt(y + r * 0.93)}" fill="none" ${stroke('brassDeep')} stroke-width="1.5" stroke-linecap="round" opacity="0.8" filter="url(#cd-graphite)"/>
    <ellipse cx="${fmt(x - r * 0.32)}" cy="${fmt(y - r * 0.36)}" rx="${fmt(r * 0.34)}" ry="${fmt(r * 0.24)}" transform="rotate(-30 ${fmt(x - r * 0.32)} ${fmt(y - r * 0.36)})" ${fill('brassHi')} opacity="0.9"/>`;
}
function mitten(G0, la, R, seed, toward) {
  // Tuck's mitten: a round mitt with a small thumb lobe on the body side, tipped toward the fingertips, a torn V
  // notch between them; no lines on it
  const toBody = Math.sign((-Math.sin(la)) * (toward[0] - G0[0]) + Math.cos(la) * (toward[1] - G0[1])) || 1;
  const ts = toBody;
  const mitt = { cx: R * 0.06, cy: -ts * R * 0.04, a: R * 1.0, b: R * 0.9, rot: 0 };
  const thumb = { cx: -R * 0.08, cy: ts * R * 0.83, a: R * 0.45, b: R * 0.31, rot: ts * 0.75 };
  const hit = (e, dx, dy) => {
    const c = Math.cos(e.rot), s = Math.sin(e.rot);
    const ox = (-e.cx) * c + (-e.cy) * s, oy = -(-e.cx) * s + (-e.cy) * c;
    const vx = dx * c + dy * s, vy = -dx * s + dy * c;
    const A2 = vx * vx / (e.a * e.a) + vy * vy / (e.b * e.b), B2 = 2 * (ox * vx / (e.a * e.a) + oy * vy / (e.b * e.b)), C2 = ox * ox / (e.a * e.a) + oy * oy / (e.b * e.b) - 1;
    const disc = B2 * B2 - 4 * A2 * C2;
    return disc < 0 ? 0 : Math.max(0, (-B2 + Math.sqrt(disc)) / (2 * A2));
  };
  const N = 120, raw = [];
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * Math.PI * 2 - Math.PI;
    const dx = Math.cos(ph), dy = Math.sin(ph);
    const rm = hit(mitt, dx, dy), rt = hit(thumb, dx, dy);
    raw.push({ ph, r: Math.max(rm, rt), thumb: rt > rm });
  }
  let phJ = null;
  for (let i = 0; i < N; i++) {
    const a = raw[i], b = raw[(i + 1) % N];
    const nearSide = ts > 0 ? (!a.thumb && b.thumb) : (a.thumb && !b.thumb);
    if (nearSide && Math.abs(a.ph) < Math.PI / 1.4) phJ = ts > 0 ? b.ph : a.ph;
  }
  const pts = raw.map(({ ph, r }) => {
    if (phJ !== null) { const d = Math.abs(Math.atan2(Math.sin(ph - phJ), Math.cos(ph - phJ))); r -= R * 0.2 * Math.max(0, 1 - d / 0.13); }
    const dx = Math.cos(ph), dy = Math.sin(ph);
    return [G0[0] + Math.cos(la) * dx * r - Math.sin(la) * dy * r, G0[1] + Math.sin(la) * dx * r + Math.cos(la) * dy * r];
  });
  return `<path d="${path(tear(pts, seed + 400, { jag: 0.25, wander: 1 }))}" ${fill('glove')} filter="url(#cd-thin)"/>`;
}
// side 'l' | 'r'; angle in degrees (0 = pointing right, 90 = straight down, −90 = straight up)
export function arm(side, angleDeg, { toward = [350, 500], bend } = {}) {
  const { D, w0, w1, glove } = G.arm;
  const [sx, sy] = side === 'l' ? G.bradL : G.bradR;
  const seed = side === 'l' ? 91 : 92;
  const b = bend ?? (side === 'l' ? 2.5 : -2.5);
  const a = angleDeg * D2R;
  const L = D - glove * 0.5;
  const S = [sx, sy], W = [sx + Math.cos(a) * L, sy + Math.sin(a) * L];
  const Gc = [sx + Math.cos(a) * D, sy + Math.sin(a) * D];
  const strip = `<path d="${path(tear(stripPts(S, W, w0, w1, b), seed * 7, { jag: 0.5, wander: 1.6 }))}" ${fill('offcut')} filter="url(#cd-paper)"/>`;
  // a faint pencil line down the strip's lower side: a flat strip, not a tube
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, sgn = ux >= 0 ? 1 : -1;
  const p = t => [sx + ux * L * t + nx * sgn * (w0 / 2 - 4), sy + uy * L * t + ny * sgn * (w0 / 2 - 4)];
  const line = `<g ${stroke('graphite')} stroke-width="1" opacity="0.18" fill="none" stroke-linecap="round" filter="url(#cd-graphite)"><path d="${pencil([p(0.2), p(0.55), p(0.92)], seed * 3, 1, 0.5)[0]}"/></g>`;
  return `${strip}${line}${mitten(Gc, a, glove, seed, toward)}${brad(sx, sy)}`;
}
export const armGlove = (side, angleDeg) => { const [sx, sy] = side === 'l' ? G.bradL : G.bradR; const a = angleDeg * D2R; return [sx + Math.cos(a) * G.arm.D, sy + Math.sin(a) * G.arm.D]; };

// ---------------------------------------------------------------------------------------------------------------
// a leg: a short, stubby strip of the offcut folded once (the lower panel turned back, a shade darker), its top hidden
// behind the card; the foot is a torn plum sole, part of the leg
export function leg(side) {
  const [hx, hy] = side === 'l' ? G.hipL : G.hipR;
  const dir = side === 'l' ? -1 : 1;
  const seed = side === 'l' ? 5 : 9;
  const top = hy - 14, fold = 657, ankle = 688;
  const wTop = 40, wFold = 37.5, wAnk = 35;
  const lean = dir * 5;
  const xAt = y => hx + lean * (y - top) / (ankle - top);
  const upper = tear(poly([[xAt(top) - wTop / 2, top], [xAt(top) + wTop / 2, top], [xAt(fold) + wFold / 2, fold], [xAt(fold) - wFold / 2, fold]], 4.5), seed * 10, { jag: 0.6, wander: 1.6 });
  const off = dir * 1.5;
  const lower = tear(poly([[xAt(fold) - wFold / 2 + off, fold - 1.5], [xAt(fold) + wFold / 2 + off, fold - 1.5], [xAt(ankle) + wAnk / 2 + off, ankle], [xAt(ankle) - wAnk / 2 + off, ankle]], 4.5), seed * 10 + 1, { jag: 0.6, wander: 1.6 });
  const crease = pen([[xAt(fold) - wFold / 2 + 2, fold - 1], [xAt(fold), fold - 0.4], [xAt(fold) + wFold / 2 - 2, fold - 1.2]], seed + 40, { sw: 1.2, op: 0.4 });
  const fx = xAt(ankle) + dir * 9, fy = 692;
  const foot = tear(spline([[fx - 30, fy + 5], [fx - 20, fy - 5], [fx + 2, fy - 8], [fx + 22, fy - 5], [fx + 31, fy + 3], [fx + 18, fy + 8.5], [fx - 16, fy + 8.5]], 5), seed + 50, { jag: 0.9, wander: 2.6 });
  return `<path d="${path(upper)}" ${fill('offcut')} filter="url(#cd-paper)"/>
    <path d="${path(lower)}" ${fill('offcutFold')} filter="url(#cd-paper)"/>
    ${crease}
    <path d="${path(foot)}" ${fill('foot')} filter="url(#cd-paper)"/>`;
}

export const shadow = () => `<ellipse cx="350" cy="701" rx="205" ry="12.5" ${fill('graphite')} opacity="0.1" filter="url(#cd-crayon)"/>`;

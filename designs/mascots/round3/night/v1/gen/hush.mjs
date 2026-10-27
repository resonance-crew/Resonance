// 悄悄 Hush — the night member of the 摺摺 series (round 3, prefix nt-).
// A softly torn dome of midnight-blue paper: the top of a paper-theatre night sky, cut straight along the
// horizon, with pin-pricked stars. Every part is built here once; rig.mjs wraps the parts in the rig
// contract's flat data-part groups at rest, concept.mjs poses the very same parts for the sheet.
import { rng, spline, poly, tear, path, smoothPath, pencil, ellipse } from './lib.mjs';

export const PFX = 'nt-';
export const C = {
  body: 'oklch(40% 0.06 260)',       // midnight-blue paper, front
  shade: 'oklch(25% 0.05 263)',      // a darker blue crayon for the volume hatching
  arm: 'oklch(70% 0.026 242)',       // the arm strips: the legs' slate paper, so they read against the dark sheet
  arm2: 'oklch(33% 0.054 263)',      // the sheet's darker offcut (legs, when they are dark)
  foot: 'oklch(30% 0.05 264)',       // the soles: the same offcut, a shade deeper
  legA: 'oklch(70% 0.026 242)',      // the legs: a slate strip folded lengthwise, light face
  legB: 'oklch(60% 0.032 248)',      // its other face, turned away from the light
  glove: 'oklch(93% 0.026 86)',      // the family's cream mitten
  brass: 'oklch(73% 0.085 82)', brassDeep: 'oklch(50% 0.06 68)', brassHi: 'oklch(94% 0.035 92)',
  pen: 'oklch(93% 0.014 250)',       // white pencil: the face's light pen
  penFill: 'oklch(90% 0.016 250)',
  glint: 'oklch(99.5% 0.004 95)',
  mouthIn: 'oklch(24% 0.045 263)',
  blush: 'oklch(72% 0.095 40)',      // the family's terracotta crayon (opaque wax reads a touch lighter on the dark sheet)
  moon: 'oklch(91.5% 0.048 95)',     // the crescent: pale moon-yellow card
  hole: 'oklch(96% 0.02 85)',        // a pin-prick, letting the page's light through
  glow: 'oklch(93% 0.075 95)',       // starlight through the holes on the night paper
  graphite: 'oklch(29% 0.018 60)',
  rim: 'oklch(97.5% 0.012 85)',
};
const fmt = n => (Math.round(n * 10) / 10).toString();
const fillS = c => `style="fill:${c}"`;
const strokeS = c => `style="stroke:${c}"`;
const D2R = Math.PI / 180;

export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-300" y="-300" width="1400" height="1400"';
  return `<defs>
  <!-- torn paper (Tuck's recipe under nt-): displaced edge, the white fibres the tear exposes, a glue shadow down-right,
       mottle and, on this dark sheet, pale fibre flecks instead of dark specks -->
  <filter id="nt-paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.88  0 0 0 0 0.92  4 0 0 0 -2.95" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.93  0 0 0 0 1  0.3 0 0 0 -0.13" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- thin paper (the mittens): same tear, a fainter shadow, a narrower rim, no specks -->
  <filter id="nt-thin" ${U} color-interpolation-filters="sRGB">
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
  <!-- cut card (the crescent): scissors, not a tear — a much smaller displacement, the rim and the shadow kept -->
  <filter id="nt-cut" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="27" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.1" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="28" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="1.4" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2" result="blur"/><feOffset dx="1.8" dy="3.2" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.26"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="29" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 0.98  0 0 0 0 0.9  0.4 0 0 0 -0.18" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- pencil: a line that skips over the tooth of the paper (white pencil here: the colour comes from the stroke) -->
  <filter id="nt-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="nt-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="nt-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <filter id="nt-crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <filter id="nt-metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
  <!-- starlight: soft halos through the pin-pricks (night paper only) -->
  <filter id="nt-glow" ${U}><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="nt-glow-s" ${U}><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>`;
}

// ---------------------------------------------------------------------------------------------
// Shared geometry (rig units: ground y = 700, centre x = 350; the body top at y = 300, 0.95 × Tuck's 420)
export const G = {
  cx: 350, ground: 700, hipY: 592, top: 300,
  halfW: 180, nx: 2.3, ny: 2.3, rc: 44, t0: 0.2, skew: 0,
  hipDX: 56, legKind: 'plain',
  eyeY: 416, eyeDX: 60, eyeRx: 11, eyeRy: 14.2,
  mouthDY: 33, cheekDX: 90, cheekDY: 32,
  shoulderDY: 34, bradR: 8, bradInset: 18,
  armD: 90, armW: [35, 30], mitten: 22,
  rest: { armL: 116, armR: 64 },
  deco: { angle: 40, inset: 0.35, R: 32, turn: -90, open: 'in' },
};
// exploration hook: NT_G='{"halfW":180}' overrides the geometry (work/ scripts only; the deliverables never set it)
if (typeof process !== 'undefined' && process.env.NT_G) Object.assign(G, JSON.parse(process.env.NT_G));
// everything placed relative to those numbers
G.legLen = G.ground - G.hipY;
G.hips = [G.cx - G.hipDX, G.cx + G.hipDX];
G.eyes = [[G.cx - G.eyeDX, G.eyeY], [G.cx + G.eyeDX, G.eyeY]];
G.mouth = [G.cx, G.eyeY + G.mouthDY];
G.cheeks = [[G.cx - G.cheekDX, G.eyeY + G.cheekDY], [G.cx + G.cheekDX, G.eyeY + G.cheekDY]];
G.shoulderY = G.mouth[1] + G.shoulderDY;
G.face = [G.cx, Math.round((G.eyeY + G.mouth[1]) / 2)];

// The dome: a half superellipse, its crown a touch left of centre, softly torn; the bottom a straight scissor cut
function domeOutline() {
  const { cx, hipY: yb, halfW: a, nx, ny, skew, rc } = G;
  const b = yb - G.top;
  const dense = [];
  const t0 = G.t0;
  for (let i = 0; i <= 600; i++) {
    const t = t0 + (i / 600) * (Math.PI - 2 * t0);
    const c = Math.cos(t), s = Math.sin(t);
    const y = yb - b * Math.pow(Math.abs(s), 2 / ny);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / nx) + skew * (yb - y);
    dense.push([x, y]);
  }
  // resample by arc length
  const step = 6, dome = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (acc >= step) { dome.push(dense[i]); acc = 0; }
  }
  // rounded bottom corners (quadratic from the bottom cut up into the dome's ends)
  const R0 = [cx + a - rc, yb + 2], L0 = [cx - a + rc, yb + 2];
  const q = (p0, c1, p1, m) => Array.from({ length: m }, (_, k) => { const t = (k + 1) / (m + 1); return [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c1[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c1[1] + t * t * p1[1]]; });
  const cornerR = q(R0, [cx + a + 1, yb + 2], dome[0], 5);
  const cornerL = q(dome[dome.length - 1], [cx - a - 1, yb + 2], L0, 5);
  const arc = [R0, ...cornerR, ...dome, ...cornerL, L0];
  const torn = tear(arc, 61, { amp: 3, jag: 1.1, wander: 5, closed: false });
  // the cut: two straight runs that meet at a slight angle, where the scissors were set down once
  const mid = [cx - 18, yb + 3.2];
  const cut = [...poly([L0, mid], 6, false).slice(1, -1), mid, ...poly([mid, R0], 6, false).slice(1, -1)];
  const r = rng(63);
  return [...torn, ...cut.map(p => [p[0], p[1] + (r() - 0.5) * 0.5])];
}
export const OUTLINE = domeOutline();
const OUTLINE_D = path(OUTLINE);

const nearest = (p) => Math.min(...OUTLINE.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
// the brads: on the body's face at shoulder height, set the inset in from the torn outline
function bradAt(sideSign) {
  const y = G.shoulderY;
  let x = G.cx + sideSign * 60;
  for (let k = 0; k < 400; k++) {
    const d = nearest([x, y]);
    if (d <= G.bradInset) break;
    x += sideSign * 0.5;
  }
  return [x, y];
}
export const BRADS = { l: bradAt(-1), r: bradAt(1) };
// the outline's x at a given height on either side
export const edgeX = (y, sideSign) => {
  const pts = OUTLINE.filter(p => Math.abs(p[1] - y) < 4 && Math.sign(p[0] - G.cx) === sideSign);
  return sideSign < 0 ? Math.min(...pts.map(p => p[0])) : Math.max(...pts.map(p => p[0]));
};

// ---------------------------------------------------------------------------------------------
// Parts. Each returns inner SVG (no data-part wrapper). I = a per-figure id prefix for clip paths.

export function shadowSvg() {
  return `<ellipse cx="350" cy="701" rx="150" ry="11" fill="${C.graphite}" opacity="0.1" filter="url(#nt-crayon)"/>`;
}

// A leg: a slate strip folded lengthwise (light face, a darker face turned from the light), its top tucked up under
// the dome, ending in a small torn sole of the dark offcut. rot turns it about the hip (the engine's swing).
export function legSvg(I, side, rot = 0) {
  const s = side === 'l' ? -1 : 1;
  const hx = side === 'l' ? G.hips[0] : G.hips[1], hy = G.hipY;
  const top = hy - 26, ya = hy + G.legLen - 13;
  const w0 = 22, w1 = 19, seed = side === 'l' ? 5 : 9;
  const lean = s * 2.5; // the ankles a touch apart: a stance, not a stool
  const strip = [[hx - w0 / 2, top], [hx + w0 / 2, top], [hx + lean + w1 / 2, ya], [hx + lean - w1 / 2, ya]];
  const stripPts = tear(poly(strip, 4.5), seed * 11, { jag: 0.7, wander: 2 });
  const tone = G.legTone === 'dark' ? C.arm2 : C.legA;
  const fx = hx + lean + s * 9, fy = G.ground - 9.5;
  const foot = tear(spline([[fx - 25, fy + 3], [fx - 12, fy - 8], [fx + 12, fy - 8.5], [fx + 26, fy + 2], [fx + 14, fy + 9.5], [fx - 14, fy + 9.5]].map(p => [fx + (p[0] - fx) * (s < 0 ? -1 : 1), p[1]]), 5), seed + 50, { jag: 0.9, wander: 2.5 });
  const t = rot ? ` transform="rotate(${fmt(rot)} ${fmt(hx)} ${fmt(hy)})"` : '';
  let detail = '';
  if (G.legKind === 'fold') {
    const cid = `${I}leg-${side}-clip`;
    const fold = [[hx + 1, top], [hx + w0 / 2 + 3, top], [hx + lean + w1 / 2 + 3, ya + 3], [hx + lean + 0.5, ya + 3]];
    const crease = pencil([[hx + 1, top + 18], [hx + 0.8 + lean * 0.5, (top + ya) / 2 + 9], [hx + lean + 0.5, ya - 2]], seed + 3, 2, 0.4);
    detail = `<clipPath id="${cid}"><path d="${path(stripPts)}"/></clipPath>
    <path d="${path(fold)}" ${fillS(C.legB)} clip-path="url(#${cid})" opacity="0.9"/>
    <g ${strokeS(C.graphite)} stroke-width="1" opacity="0.32" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${crease.map(d => `<path d="${d}"/>`).join('')}</g>`;
  } else {
    // a flat strip: one faint pencil line down its shadow side, nothing else
    const line = pencil([[hx + w0 / 2 - 4, top + 30], [hx + lean * 0.5 + (w0 + w1) / 4 - 4, (top + ya) / 2 + 12], [hx + lean + w1 / 2 - 4, ya - 4]], seed + 3, 1, 0.4);
    detail = `<g ${strokeS(G.legTone === 'dark' ? C.pen : C.graphite)} stroke-width="1" opacity="${G.legTone === 'dark' ? 0.16 : 0.22}" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${line.map(d => `<path d="${d}"/>`).join('')}</g>`;
  }
  return `<g${t}>
    <path d="${path(stripPts)}" ${fillS(tone)} filter="url(#nt-paper)"/>
    ${detail}
    <path d="${path(foot)}" ${fillS(C.foot)} filter="url(#nt-paper)"/>
  </g>`;
}

// The torso: the dome sheet, a darker crayon hatching down its lower right (volume), a faint lighter wash where the
// lamp would catch its crown, and the white-pencil guide line it was cut along, left a little above the bottom.
export function torsoSvg(I) {
  const cid = `${I}body-clip`;
  const hatches = [];
  // long, sparse strokes just inside the right-hand edge, from the shoulder of the dome down to the cut
  for (let i = 0; i < 16; i++) {
    const tt = i / 15, y = 392 + tt * 196;
    const x = edgeX(y, 1) - 14 - Math.sin(tt * Math.PI) * 6;
    hatches.push(pencil([[x - 9, y - 22], [x + 3, y + 12]], 300 + i, 1, 0.6)[0]);
  }
  const light = [];
  for (let i = 0; i < 9; i++) {
    const tt = i / 8, ang = Math.PI + 0.55 + tt * 0.8;
    const x = 345 + Math.cos(ang) * 132, y = 452 + Math.sin(ang) * 118;
    light.push(pencil([[x - 6, y + 9], [x + 5, y - 9]], 340 + i, 1, 0.5)[0]);
  }
  const gy = G.hipY - 9.5;
  const guide = pencil([[edgeX(gy, -1) + 18, gy + 0.4], [300, gy - 0.4], [392, gy + 0.2], [edgeX(gy, 1) - 30, gy - 0.6]], 360, 2, 0.35);
  return `<clipPath id="${cid}"><path d="${OUTLINE_D}"/></clipPath>
    <path d="${OUTLINE_D}" ${fillS(C.body)} filter="url(#nt-paper)"/>
    <g clip-path="url(#${cid})">
      <g ${strokeS(C.shade)} stroke-width="1.5" opacity="0.32" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${hatches.map(d => `<path d="${d}"/>`).join('')}</g>
      <g ${strokeS(C.pen)} stroke-width="1.1" opacity="0.13" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${light.map(d => `<path d="${d}"/>`).join('')}</g>
      <g ${strokeS(C.pen)} stroke-width="1" opacity="0.3" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${guide.map(d => `<path d="${d}"/>`).join('')}</g>
    </g>`;
}

// The stars: pin-pricks through the sheet. In daylight each is a speck of the page's light with a little raised
// burr of pale fibres round it; on the night paper `stars-glow` adds the light coming through.
export const STARS = [
  [302, 338, 4.6, true], [340, 322, 2.4], [266, 366, 3.2], [376, 352, 3.2], [238, 406, 2.4],
  [320, 378, 2.0], [398, 326, 2.2], [222, 448, 2.6], [472, 418, 3.6, true], [302, 528, 1.9], [418, 546, 2.2],
];
export function starsSvg() {
  return STARS.map(([x, y, r, big], i) => {
    const burr = [];
    const rr = rng(700 + i);
    for (let k = 0; k < 7; k++) { const a = rr() * Math.PI * 2, l = r + 1.2 + rr() * 1.8; burr.push(`M${fmt(x + Math.cos(a) * (r + 0.4))},${fmt(y + Math.sin(a) * (r + 0.4))}L${fmt(x + Math.cos(a) * l)},${fmt(y + Math.sin(a) * l)}`); }
    const spark = big ? `<g ${strokeS(C.hole)} stroke-width="1.5" stroke-linecap="round" opacity="0.75">
        <path d="M${fmt(x)},${fmt(y - r * 2.5)}L${fmt(x)},${fmt(y + r * 2.5)}M${fmt(x - r * 2.5)},${fmt(y)}L${fmt(x + r * 2.5)},${fmt(y)}"/></g>` : '';
    return `<g>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r + 1.3)}" fill="none" ${strokeS(C.pen)} stroke-width="1.2" opacity="0.35" filter="url(#nt-graphite)"/>
      <path d="${burr.join('')}" ${strokeS(C.pen)} stroke-width="0.9" opacity="0.5" fill="none"/>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fillS(C.hole)}/>
      <path d="M${fmt(x - r * 0.8)},${fmt(y - r * 0.4)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + r * 0.4)},${fmt(y - r * 0.85)}" fill="none" ${strokeS(C.shade)} stroke-width="${fmt(Math.max(0.8, r * 0.35))}" opacity="0.45"/>
      ${spark}
    </g>`;
  }).join('');
}
export function starsGlowSvg() {
  const halos = STARS.map(([x, y, r]) => `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 3.6 + 3)}" ${fillS(C.glow)} opacity="0.42"/>`).join('');
  const cores = STARS.map(([x, y, r]) => `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 1.6)}" ${fillS(C.glint)} opacity="0.9"/>`).join('');
  const rays = STARS.filter(s => s[3]).map(([x, y, r]) => `<path d="M${fmt(x)},${fmt(y - r * 5)}L${fmt(x)},${fmt(y + r * 5)}M${fmt(x - r * 5)},${fmt(y)}L${fmt(x + r * 5)},${fmt(y)}" ${strokeS(C.glow)} stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`).join('');
  return `<g filter="url(#nt-glow)">${halos}</g><g filter="url(#nt-glow-s)">${cores}${rays}</g>`;
}

// The head decoration: a crescent cut from pale moon-yellow card, held on the crown's right shoulder by a brass snap
// clip. It lies along the dome's curve, half over the edge, its horns turned in toward the face: a hair clip it
// chose, a moon over its own little sky — never an upright prong.
export function crescentPts(cx, cy, R, rotDeg) {
  const r = R * 0.97, d = R * 0.5; // inner (cut-away) circle: radius r, centre d along the opening's direction
  const xi = (R * R - r * r + d * d) / (2 * d), yi = Math.sqrt(R * R - xi * xi);
  const aO = Math.atan2(yi, xi), aI = Math.atan2(yi, xi - d);
  const pts = [];
  const m = 40;
  for (let k = 0; k <= m; k++) { const a = aO + (k / m) * (2 * Math.PI - 2 * aO); pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  // the cut-away circle's arc that lies inside the outer one: from the lower tip back round through its far side
  for (let k = 1; k < m; k++) { const a = (2 * Math.PI - aI) - (k / m) * (2 * Math.PI - 2 * aI); pts.push([d + Math.cos(a) * r, Math.sin(a) * r]); }
  const ro = rotDeg * D2R, c = Math.cos(ro), s = Math.sin(ro);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
// where the crescent sits: on the outline at `angle` degrees right of the crown (seen from the torso pivot), pulled
// `inset`·R inward; its opening faces the face ('in') or the sky ('out'), turned a further `turn` degrees
export function decoPlace() {
  const { angle, inset, R, turn, open } = G.deco;
  const a = (angle - 90) * D2R;
  let best = OUTLINE[0], bd = 1e9;
  for (const q of OUTLINE) { const qa = Math.atan2(q[1] - 470, q[0] - G.cx); const d = Math.abs(qa - a); if (d < bd) { bd = d; best = q; } }
  const inx = G.cx - best[0], iny = 470 - best[1], il = Math.hypot(inx, iny);
  const cx = best[0] + inx / il * R * inset, cy = best[1] + iny / il * R * inset;
  const toFace = Math.atan2(G.face[1] - cy, G.face[0] - cx) / D2R;
  const rot = (open === 'in' ? toFace : toFace + 180) + turn;
  const oa = rot * D2R;
  return { cx, cy, R, rot, edge: best, clip: [cx + Math.cos(oa) * R * 0.42, cy + Math.sin(oa) * R * 0.42] };
}
export function decoSvg() {
  const { cx, cy, R, rot } = decoPlace();
  const moon = tear(crescentPts(cx, cy, R, rot), 81, { jag: 0.25, wander: 0.8 });
  // the snap clip: a slim brass loop on the dome, half under the crescent's hollow, its tail toward the crown
  const oa = rot * D2R; // toward the opening
  const bx = cx + Math.cos(oa) * R * 0.42, by = cy + Math.sin(oa) * R * 0.42;
  const ang = (rot - 90) * D2R; // across the opening
  const L = 20, w = 3.4;
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const loop = [];
  for (let k = 0; k <= 28; k++) { const t = (k / 28) * Math.PI * 2; const ex = Math.cos(t) * L, ey = Math.sin(t) * w * (Math.cos(t) > 0 ? 0.7 : 1.15); loop.push([bx + ux * ex + nx * ey, by + uy * ex + ny * ey]); }
  const ca = (rot + 180) * D2R;
  return `<path d="${smoothPath(loop, true)}" fill="none" ${strokeS('oklch(20% 0.03 55)')} stroke-width="3.4" opacity="0.35" transform="translate(1 1.6)" filter="url(#nt-crayon-soft)"/>
    <path d="${smoothPath(loop, true)}" fill="none" ${strokeS(C.brass)} stroke-width="2.6" filter="url(#nt-metal)"/>
    <path d="M${fmt(bx - ux * L * 0.5)},${fmt(by - uy * L * 0.5 - 1)}L${fmt(bx + ux * L * 0.55)},${fmt(by + uy * L * 0.55 - 1)}" ${strokeS(C.brassHi)} stroke-width="0.9" opacity="0.6"/>
    <path d="${path(moon)}" ${fillS(C.moon)} filter="url(#nt-cut)"/>
    <circle cx="${fmt(cx + Math.cos(ca) * R * 0.74)}" cy="${fmt(cy + Math.sin(ca) * R * 0.74)}" r="2.2" fill="none" ${strokeS(C.graphite)} stroke-width="1" opacity="0.16" filter="url(#nt-graphite)"/>`;
}

// Cheeks: the family's three short terracotta crayon strokes.
export function cheeksSvg(op = 0.8) {
  const hatch = ([cx, cy], seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 8.5 + i * 8.5; d += pencil([[x - 3, cy + 5.5], [x + 3, cy - 5.5]], seed + i, 2, 0.5).map(q => `<path d="${q}"/>`).join(''); }
    return `<g ${strokeS(C.blush)} stroke-width="4.6" fill="none" stroke-linecap="round" filter="url(#nt-crayon)">${d}</g>`;
  };
  return `<g opacity="${op}">${hatch(G.cheeks[0], 501)}${hatch(G.cheeks[1], 511)}</g>`;
}

// Eyes in white pencil: a pale filled oval with one brighter glint (never a dark pupil); variants: shut (the happy
// arc), sleepy (half-lidded, the lid a heavier line) and nap (closed, the arc sagging the other way).
export function eyeSvg(I, side, kind = 'open', look = [0, 0]) {
  const [cx0, cy0] = G.eyes[side === 'l' ? 0 : 1];
  const rx = G.eyeRx * (side === 'l' ? 1 : 0.97), ry = G.eyeRy * (side === 'l' ? 1 : 0.97);
  const seed = side === 'l' ? 71 : 72, tilt = side === 'l' ? -0.08 : 0.08;
  const cx = cx0 + look[0], cy = cy0 + look[1];
  const line = (pts, sw, s2, op = 1) => `<g ${strokeS(C.pen)} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#nt-graphite)">${pencil(pts, s2, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
  if (kind === 'shut') return line([[cx - rx * 1.25, cy + 4], [cx - rx * 0.55, cy - ry * 0.45], [cx + rx * 0.55, cy - ry * 0.45], [cx + rx * 1.25, cy + 4]], 3, seed);
  if (kind === 'nap') return line([[cx - rx * 1.25, cy - 1], [cx - rx * 0.55, cy + ry * 0.42], [cx + rx * 0.55, cy + ry * 0.42], [cx + rx * 1.25, cy - 1]], 3, seed + 5);
  const oval = tear(ellipse(cx, cy, rx, ry, 22, tilt), seed, { jag: 0.25, wander: 0.5 });
  if (kind === 'sleepy') {
    const lidY = cy - ry * 0.12;
    const cid = `${I}lid-${side}`;
    return `<clipPath id="${cid}"><rect x="${fmt(cx - rx * 2)}" y="${fmt(lidY)}" width="${fmt(rx * 4)}" height="${fmt(ry * 2)}"/></clipPath>
      <g clip-path="url(#${cid})"><path d="${smoothPath(oval, true)}" ${fillS(C.penFill)} filter="url(#nt-graphite-fill)"/>
      <ellipse cx="${fmt(cx - rx * 0.3)}" cy="${fmt(lidY + ry * 0.32)}" rx="${fmt(rx * 0.26)}" ry="${fmt(ry * 0.18)}" ${fillS(C.glint)}/></g>
      ${line([[cx - rx * 1.3, lidY + 1.5], [cx - rx * 0.3, lidY - 1.2], [cx + rx * 0.6, lidY - 0.6], [cx + rx * 1.3, lidY + 2.5]], 3, seed + 9)}`;
  }
  const ring = [...oval, oval[0], oval[1]];
  return `<path d="${smoothPath(oval, true)}" ${fillS(C.penFill)} filter="url(#nt-graphite-fill)"/>
    <g ${strokeS(C.pen)} stroke-width="1.5" fill="none" opacity="0.75" filter="url(#nt-graphite)">${pencil(ring, seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
    <ellipse cx="${fmt(cx - rx * 0.32)}" cy="${fmt(cy - ry * 0.34)}" rx="${fmt(rx * 0.3)}" ry="${fmt(ry * 0.25)}" ${fillS(C.glint)}/>`;
}

// Mouth: a small soft smile in white pencil; mouth-o: a small open o (the pale ring round the dark of an open mouth): a yawn
export function mouthSvg(kind = 'smile', look = [0, 0]) {
  const [mx0, my0] = G.mouth;
  const mx = mx0 + look[0], my = my0 + look[1];
  if (kind === 'o') return `<ellipse cx="${fmt(mx)}" cy="${fmt(my + 3)}" rx="7" ry="8.8" ${fillS(C.mouthIn)} opacity="0.85"/>
    <g ${strokeS(C.pen)} stroke-width="2.5" fill="none" filter="url(#nt-graphite)">${pencil(ellipse(mx, my + 3, 7, 8.8, 16).concat([[mx + 7, my + 3]]), 18, 2, 0.4).map(d => `<path d="${d}"/>`).join('')}</g>`;
  return `<g ${strokeS(C.pen)} stroke-width="2.3" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${pencil([[mx - 10, my - 2.5], [mx - 4, my + 2.8], [mx + 4, my + 2.8], [mx + 10, my - 2.5]], 17, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
}

// ---------------------------------------------------------------------------------------------
// Arms: a torn strip of the dark offcut, pinned through its rounded end by a brass brad set inside the dome's edge,
// ending in the family's cream mitten (thumb toward the body). Built at the angle it is drawn at, so the glue shadow
// keeps falling down-right (0° = pointing right, 90° = straight down).
function stripPts(S, E, w0, w1, bend, step = 4) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const ux = (E[0] - S[0]) / L, uy = (E[1] - S[1]) / L, nx = -uy, ny = ux;
  const m = Math.max(4, Math.round(L / step));
  const Cc = t => { const b = Math.sin(Math.PI * t) * bend; return [S[0] + ux * L * t + nx * b, S[1] + uy * L * t + ny * b]; };
  const W = t => (w0 + (w1 - w0) * t) / 2;
  const pts = [];
  for (let i = 0; i <= m; i++) { const t = i / m, c = Cc(t), w = W(t); pts.push([c[0] + nx * w, c[1] + ny * w]); }
  pts.push([E[0] + ux * 3, E[1] + uy * 3]);
  for (let i = m; i >= 0; i--) { const t = i / m, c = Cc(t), w = W(t); pts.push([c[0] - nx * w, c[1] - ny * w]); }
  for (let k = 1; k < 9; k++) { const a = -Math.PI / 2 - (k / 9) * Math.PI; pts.push([S[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w0 / 2, S[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w0 / 2]); }
  return pts;
}
function bradSvg(x, y, r = G.bradR) {
  return `<circle cx="${fmt(x + 1.3)}" cy="${fmt(y + 2)}" r="${fmt(r + 0.6)}" fill="oklch(20% 0.03 55)" opacity="0.4" filter="url(#nt-crayon-soft)"/>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fillS(C.brass)} filter="url(#nt-metal)"/>
      <path d="M${fmt(x + r * 0.95)},${fmt(y - r * 0.2)} A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x - r * 0.35)},${fmt(y + r * 0.93)}" fill="none" ${strokeS(C.brassDeep)} stroke-width="1.6" stroke-linecap="round" opacity="0.8" filter="url(#nt-graphite)"/>
      <ellipse cx="${fmt(x - r * 0.32)}" cy="${fmt(y - r * 0.36)}" rx="${fmt(r * 0.34)}" ry="${fmt(r * 0.24)}" transform="rotate(-30 ${fmt(x - r * 0.32)} ${fmt(y - r * 0.36)})" ${fillS(C.brassHi)} opacity="0.9"/>`;
}
export function armSvg(I, side, angleDeg) {
  const [sx, sy] = BRADS[side];
  const seed = side === 'l' ? 91 : 92;
  const bend = side === 'l' ? 2.5 : -2.5;
  const D = G.armD, R = G.mitten, [w0, w1] = G.armW;
  const a = angleDeg * D2R;
  const Lr = D - R * 0.5;
  const S = [sx, sy], W = [sx + Math.cos(a) * Lr, sy + Math.sin(a) * Lr];
  const strip = tear(stripPts(S, W, w0, w1, bend), seed * 7, { jag: 0.55, wander: 1.8 });
  const la = a;
  const Gc = [W[0] + Math.cos(la) * R * 0.5, W[1] + Math.sin(la) * R * 0.5];
  // flat strip, not a tube: one faint pencil line down its lower edge
  const L = Math.hypot(W[0] - sx, W[1] - sy), ux = (W[0] - sx) / L, uy = (W[1] - sy) / L, nx = -uy, ny = ux;
  const sg = ux >= 0 ? 1 : -1;
  const pp = t => [sx + ux * L * t + nx * sg * (w0 / 2 - 4), sy + uy * L * t + ny * sg * (w0 / 2 - 4)];
  const sideLine = pencil([pp(0.22), pp(0.55), pp(0.92)], seed * 3, 1, 0.5)[0];
  // the mitten: a round mitt with a small thumb lobe on the side facing the body, a torn V notch between them
  const toBody = Math.sign((-Math.sin(la)) * (G.cx - Gc[0]) + Math.cos(la) * (452 - Gc[1])) || 1;
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
  for (let i = 0; i < N; i++) { const ph = (i / N) * Math.PI * 2 - Math.PI; const dx = Math.cos(ph), dy = Math.sin(ph); const rm = hit(mitt, dx, dy), rt = hit(thumb, dx, dy); raw.push({ ph, r: Math.max(rm, rt), thumb: rt > rm }); }
  let phJ = null;
  for (let i = 0; i < N; i++) { const p = raw[i], q = raw[(i + 1) % N]; const near = ts > 0 ? (!p.thumb && q.thumb) : (p.thumb && !q.thumb); if (near && Math.abs(p.ph) < Math.PI / 1.4) phJ = ts > 0 ? q.ph : p.ph; }
  const mpts = raw.map(({ ph, r }) => {
    if (phJ !== null) { const d = Math.abs(Math.atan2(Math.sin(ph - phJ), Math.cos(ph - phJ))); r -= R * 0.2 * Math.max(0, 1 - d / 0.13); }
    const dx = Math.cos(ph), dy = Math.sin(ph);
    return [Gc[0] + Math.cos(la) * dx * r - Math.sin(la) * dy * r, Gc[1] + Math.sin(la) * dx * r + Math.cos(la) * dy * r];
  });
  const m = tear(mpts, seed + 400, { jag: 0.25, wander: 1 });
  return `<path d="${path(strip)}" ${fillS(C.arm)} filter="url(#nt-paper)"/>
    <g ${strokeS(C.pen)} stroke-width="1" opacity="0.16" fill="none" stroke-linecap="round" filter="url(#nt-graphite)"><path d="${sideLine}"/></g>
    <path d="${path(m)}" ${fillS(C.glove)} filter="url(#nt-thin)"/>
    ${bradSvg(sx, sy)}`;
}
export const mittenCentre = (side, angleDeg) => {
  const [sx, sy] = BRADS[side], a = angleDeg * D2R;
  return [sx + Math.cos(a) * G.armD, sy + Math.sin(a) * G.armD];
};

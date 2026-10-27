// 牽牽 Twine (round 3, the 摺摺 series) — a mist-blue die-cut card-stock gift tag on long folded-card legs.
// Its own string (paper raffia) runs through the brass eyelet and is tied into a bow: that bow is its head decoration.
// Its back carries a handwritten 「給：」 line with nothing written after it yet.
//
// Everything is drawn in the series' rig units (viewBox 0 0 700 760, ground y = 700, centred on x = 350).
// `parts(P, pose)` returns each part as an SVG string at the pose asked for; rig.mjs wraps them in flat data-part
// groups at rest, concept.mjs composes posed figures. The paper filters are round 2 Tuck's recipes under `tg-` ids;
// the body uses a card-stock variant (cut, not torn: a smaller, slower displacement and a cleaner rim).
import { rng, spline, poly, tear, path, smoothPath, pencil, ellipse } from './lib.mjs';

export const C = {
  card: 'oklch(81% 0.04 220)',        // mist-blue card stock, the coated front
  cardBack: 'oklch(88% 0.024 214)',   // the uncoated back (seen when it turns round)
  print: 'oklch(58% 0.055 228)',      // the die-cut tag's printed border line
  arm: 'oklch(67% 0.047 226)',        // arm strips: an offcut of a deeper blue card
  legA: 'oklch(66% 0.047 226)',       // leg strips: the arms' deeper blue card
  foot: 'oklch(57% 0.05 231)',        // torn soles, a shade darker
  glove: 'oklch(93% 0.026 86)',       // the family's cream mitten paper
  raffia: 'oklch(63% 0.115 42)',      // paper raffia (the tag's own string), terracotta
  raffiaDeep: 'oklch(50% 0.1 38)',
  brass: 'oklch(73% 0.085 82)', brassDeep: 'oklch(50% 0.06 68)', brassHi: 'oklch(94% 0.035 92)',
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(69% 0.1 38)',
  noteP: 'oklch(95% 0.018 88)',       // a little folded note (vignettes only)
  rim: 'oklch(97.5% 0.012 85)',
};
const VAR = { card: 'card', cardBack: 'card-back', print: 'print', arm: 'arm', legA: 'leg', foot: 'foot', glove: 'glove',
  raffia: 'raffia', raffiaDeep: 'raffia-deep', brass: 'brad', brassDeep: 'brad-rim', brassHi: 'brad-glint', graphite: 'ink', glint: 'glint', blush: 'blush', noteP: 'note' };
const fill = (k, v) => `style="fill:${v || `var(--tg-${VAR[k]}, ${C[k]})`}"`;
const stroke = (k, v) => `style="stroke:${v || `var(--tg-${VAR[k]}, ${C[k]})`}"`;
const fmt = n => n.toFixed(1);
const D2R = Math.PI / 180;

// ---------- shared geometry (rig units) ----------
export const G = {
  cx: 350, ground: 700,
  // the die-cut pentagon, clockwise from the apex; a little hand-cut wobble in the vertices themselves
  V: [[351, 133], [448, 208], [446, 521], [255, 519], [253, 210]],
  R: [12, 10, 15, 15, 10],
  eyelet: [350, 190], hole: 10.5, ring: 18,
  knot: [350, 152],
  eyeL: [307, 304], eyeR: [393, 302],
  mouth: [350, 332],
  cheekL: [291, 334], cheekR: [409, 332],
  faceCenter: [350, 316],
  brad: 8, bradL: [270, 394], bradR: [430, 394],
  armD: 86, armW: 30, gloveR: 23, armRest: [102, 78],
  hipL: [320, 505], hipR: [380, 505], legLen: 177, legRest: [92.4, 87.6], sole: 698,
  torsoPivot: [350, 516],
  top: 133,
};
export const HEIGHT = G.ground - G.top; // 567 = 1.35 × Tuck's 420

// ---------- filters ----------
export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-400" y="-400" width="2600" height="1900"';
  return `<defs>
  <!-- cut card stock: a slow, small wobble (scissors, not a tear), the white fibre rim, the glue shadow, mottle, a few specks -->
  <filter id="tg-card" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="17" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.6" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="1.5" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.33  0 0 0 0 0.36  4 0 0 0 -2.95" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.07" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.3 0 0 0 -0.13" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- torn paper (Tuck's c2-paper): the soles -->
  <filter id="tg-paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- thin paper (Tuck's c2-thin): mittens, the raffia, the note -->
  <filter id="tg-thin" ${U} color-interpolation-filters="sRGB">
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
  <filter id="tg-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="tg-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <filter id="tg-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <filter id="tg-crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <filter id="tg-metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
</defs>`;
}

// ---------- geometry helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const unit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
// rotate p about c by deg
const rot = (p, c, deg) => { const a = deg * D2R, x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; };

// A polygon with rounded corners (quadratic corners), resampled every `step`.
function roundedPoly(V, R, step = 4) {
  const n = V.length, out = [];
  const corners = V.map((P, i) => {
    const a = unit(sub(V[(i - 1 + n) % n], P)), b = unit(sub(V[(i + 1) % n], P));
    const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    const t = R[i] / Math.tan(ang / 2);
    return { P, T0: add(P, mul(a, t)), T1: add(P, mul(b, t)) };
  });
  for (let i = 0; i < n; i++) {
    const { P, T0, T1 } = corners[i];
    for (let k = 0; k < 6; k++) { const t = k / 6; out.push([(1 - t) ** 2 * T0[0] + 2 * (1 - t) * t * P[0] + t * t * T1[0], (1 - t) ** 2 * T0[1] + 2 * (1 - t) * t * P[1] + t * t * T1[1]]); }
    const N = corners[(i + 1) % n].T0;
    const m = Math.max(1, Math.round(Math.hypot(N[0] - T1[0], N[1] - T1[1]) / step));
    for (let k = 0; k < m; k++) out.push([T1[0] + (N[0] - T1[0]) * k / m, T1[1] + (N[1] - T1[1]) * k / m]);
  }
  return out;
}
// Offset a convex polygon inward by d.
function inset(V, d) {
  const n = V.length;
  const c = V.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  const L = V.map((a, i) => {
    const b = V[(i + 1) % n];
    let nrm = unit([-(b[1] - a[1]), b[0] - a[0]]);
    if ((c[0] - a[0]) * nrm[0] + (c[1] - a[1]) * nrm[1] < 0) nrm = mul(nrm, -1);
    return [add(a, mul(nrm, d)), add(b, mul(nrm, d))];
  });
  const X = (l1, l2) => {
    const [p, p2] = l1, [q, q2] = l2;
    const r = sub(p2, p), s = sub(q2, q);
    const den = r[0] * s[1] - r[1] * s[0];
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    return add(p, mul(r, t));
  };
  return V.map((_, i) => X(L[(i - 1 + n) % n], L[i]));
}
const mirrorX = (pts, cx = G.cx) => pts.map(p => [2 * cx - p[0], p[1]]);

// the card's outline (front, or mirrored for its back) with the eyelet hole as a second sub-path
function bodyOutline(mirror = false) {
  let pts = tear(roundedPoly(G.V, G.R, 4), 61, { amp: 0.3, jag: 0.35, wander: 3.2 });
  if (mirror) pts = mirrorX(pts).reverse();
  return pts;
}
const holePath = (c, r) => path(ellipse(c[0], c[1], r, r, 32).reverse());

// ---------- parts ----------
function brad(x, y, r = G.brad) {
  return `<circle cx="${fmt(x + 1.3)}" cy="${fmt(y + 2)}" r="${fmt(r + 0.6)}" fill="oklch(28% 0.03 55)" opacity="0.28" filter="url(#tg-crayon-soft)"/>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fill('brass')} filter="url(#tg-metal)"/>
      <path d="M${fmt(x + r * 0.95)},${fmt(y - r * 0.2)} A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x - r * 0.35)},${fmt(y + r * 0.93)}" fill="none" ${stroke('brassDeep')} stroke-width="1.6" stroke-linecap="round" opacity="0.8" filter="url(#tg-graphite)"/>
      <ellipse cx="${fmt(x - r * 0.32)}" cy="${fmt(y - r * 0.36)}" rx="${fmt(r * 0.34)}" ry="${fmt(r * 0.24)}" transform="rotate(-30 ${fmt(x - r * 0.32)} ${fmt(y - r * 0.36)})" ${fill('brassHi')} opacity="0.9"/>`;
}
// the brass eyelet: a rolled ring around the hole
function grommet(c, back = false) {
  const [x, y] = c, r0 = G.hole + 0.5, r1 = G.ring;
  const ring = path(ellipse(x, y, r1, r1, 40)) + path(ellipse(x, y, r0, r0, 32).reverse());
  return `<path d="${ring}" fill="oklch(28% 0.03 55)" opacity="0.26" transform="translate(1.6 2.6)" filter="url(#tg-crayon-soft)"/>
      <path d="${ring}" ${fill('brass')} filter="url(#tg-metal)"/>
      <g fill="none" stroke-linecap="round" filter="url(#tg-graphite)">
        <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r0 + 1.6)}" ${stroke('brassDeep')} stroke-width="1.5" opacity="0.75"/>
        <path d="M${fmt(x + r1 * 0.96)},${fmt(y - r1 * 0.15)} A${fmt(r1)},${fmt(r1)} 0 0 1 ${fmt(x - r1 * 0.3)},${fmt(y + r1 * 0.95)}" ${stroke('brassDeep')} stroke-width="1.4" opacity="0.6"/>
      </g>
      ${back ? '' : `<path d="M${fmt(x - r1 * 0.78)},${fmt(y - r1 * 0.45)} A${fmt(r1 * 0.84)},${fmt(r1 * 0.84)} 0 0 1 ${fmt(x - r1 * 0.1)},${fmt(y - r1 * 0.84)}" fill="none" ${stroke('brassHi')} stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>`}`;
}

// The card itself. `back` draws the uncoated side with the handwritten 「給：」 line.
function torso(P, back = false) {
  const pts = bodyOutline(back);
  const d = path(pts) + holePath(G.eyelet, G.hole);
  const clip = `${P}${back ? 'back' : 'card'}clip`;
  let inner = '';
  if (!back) {
    // the die-cut tag's printed border, a thin line set in from the cut (printing never sits exactly on a cut)
    const border = tear(roundedPoly(inset(G.V, 13), G.R.map(r => r * 0.8), 4), 62, { amp: 0, jag: 0.15, wander: 1.2 });
    inner += `<path d="${path(border)}" fill="none" ${stroke('print')} stroke-width="1.7" opacity="0.5" filter="url(#tg-graphite)"/>`;
    // a few faint pencil strokes down the lower right: a flat card catching less light there, not a 3D shade
    const h = [];
    for (let i = 0; i < 12; i++) { const y = 400 + i * 10; h.push(pencil([[434 - (i % 2) * 3, y], [443, y + 14]], 300 + i, 1, 0.5)[0]); }
    inner += `<g ${stroke('graphite')} stroke-width="1.1" opacity="0.14" fill="none" filter="url(#tg-graphite)">${h.map(q => `<path d="${q}"/>`).join('')}</g>`;
  } else {
    inner += backWriting();
    // the brads seen from behind: each split pin's two prongs bent flat, one each way
    for (const [bx, by] of [G.bradL, G.bradR].map(p => [2 * G.cx - p[0], p[1]])) {
      inner += `<g ${stroke('brassDeep')} stroke-width="4.2" stroke-linecap="round" fill="none" opacity="0.85" filter="url(#tg-metal)">
        <path d="M${fmt(bx - 2)},${fmt(by)} L${fmt(bx - 15)},${fmt(by + 3)}"/><path d="M${fmt(bx + 2)},${fmt(by)} L${fmt(bx + 15)},${fmt(by + 4)}"/></g>
        <g ${stroke('brass')} stroke-width="2.6" stroke-linecap="round" fill="none" filter="url(#tg-metal)">
        <path d="M${fmt(bx - 2)},${fmt(by)} L${fmt(bx - 15)},${fmt(by + 3)}"/><path d="M${fmt(bx + 2)},${fmt(by)} L${fmt(bx + 15)},${fmt(by + 4)}"/></g>
        <circle cx="${fmt(bx)}" cy="${fmt(by)}" r="3.2" ${fill('brassDeep')} opacity="0.7"/>`;
    }
  }
  // seen from behind, the string comes over the top edge and goes down into the eyelet
  const strand = back ? `<path d="${path(tear(poly([[347, 124], [355, 124], [354.5, 186], [345.5, 186]], 3), 77, { amp: 0, jag: 0.4, wander: 0.6 }))}" ${fill('raffia')} filter="url(#tg-thin)"/>` : '';
  return `<path d="${d}" fill-rule="evenodd" ${fill(back ? 'cardBack' : 'card')} filter="url(#tg-card)"/>
    <clipPath id="${clip}"><path d="${path(pts)}"/></clipPath>
    <g clip-path="url(#${clip})">${inner}</g>
    ${grommet(G.eyelet, back)}
    ${strand}`;
}

// 「給：」 by hand in pencil, then a ruled line left blank: who it is for is not written yet.
function backWriting() {
  // strokes of 給 (traditional, 糹 + 合) in a 100-unit box, as a pen would make them
  const S = [
    [[30, 8], [17, 29], [31, 31]],                 // 糹: first zigzag
    [[34, 19], [13, 52], [39, 46]],                // second zigzag
    [[33, 37], [41, 49]],                          // its dot
    [[26, 50], [26.5, 92]],                        // the vertical
    [[15, 64], [10, 80]],                          // bottom-left dot
    [[36, 64], [42, 77]],                          // bottom-right dot
    [[72, 6], [62, 22], [46, 42]],                 // 合: the left sweep
    [[72, 8], [83, 24], [98, 40]],                 // the right sweep
    [[61, 40], [84, 39]],                          // the short stroke
    [[55, 55], [56, 91]],                          // 口: left
    [[55, 55], [87, 54], [85, 90]],                // 口: top and right
    [[56, 89], [85, 88]],                          // 口: bottom
  ];
  const ox = 271, oy = 296, k = 0.56, tilt = -3;
  const T = p => rot([ox + p[0] * k, oy + p[1] * k], [ox, oy + 25], tilt);
  let d = '';
  S.forEach((s, i) => { const pts = s.length === 2 ? [s[0], [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2], s[1]] : s; d += pencil(pts.map(T), 900 + i, 2, 0.35).map(q => `<path d="${q}"/>`).join(''); });
  // the colon
  const c1 = T([112, 40]), c2 = T([112, 78]);
  const dots = [c1, c2].map(c => `<circle cx="${fmt(c[0])}" cy="${fmt(c[1])}" r="2.6" ${fill('graphite')}/>`).join('');
  // the ruled line after it, left blank
  const l0 = T([128, 94]), l1 = [428, l0[1] - 8];
  const rl = rng(931); const line = [];
  for (let i = 0; i <= 10; i++) line.push([l0[0] + (l1[0] - l0[0]) * i / 10, l0[1] + (l1[1] - l0[1]) * i / 10 + (rl() - 0.5) * 1.2]);
  const ruled = pencil(line, 932, 2, 0.4).map(q => `<path d="${q}"/>`).join('');
  return `<g ${stroke('graphite')} stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.82" filter="url(#tg-graphite)">${d}</g>
    <g opacity="0.82" filter="url(#tg-graphite)">${dots}</g>
    <g ${stroke('graphite')} stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.5" filter="url(#tg-graphite)">${ruled}</g>`;
}

// The bow: the tag's own paper-raffia string, round the top edge, through the eyelet, tied in a bow just above it.
// Drawn around the knot `K`, turned by `tiltDeg`; `perk` (−1 droop … 1 perk) lifts the loops' ends a little.
function bow(K = G.knot, { tiltDeg = -3, perk = 0, seed = 1 } = {}) {
  const T = p => rot(add(K, p), K, tiltDeg);
  const crinkle = (pts, s, op = 0.35) => `<g ${stroke('raffiaDeep')} stroke-width="1.1" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#tg-graphite)">${pencil(pts.map(T), s, 1, 0.3).map(q => `<path d="${q}"/>`).join('')}</g>`;
  const lobe = (dir, L, h, s) => {
    const lift = -perk * 6;
    const keys = [[5, -8], [L * 0.42, -h * 0.45], [L * 0.86, -h * 0.52 + lift], [L * 1.03, -h * 0.08 + lift], [L * 0.94, h * 0.36 + lift], [L * 0.58, h * 0.46], [L * 0.22, h * 0.22], [5, 8]]
      .map(([x, y]) => [x * dir, y]);
    const inner = [[7, -4], [L * 0.32, -h * 0.2], [L * 0.52, -h * 0.02 + lift * 0.5], [L * 0.32, h * 0.2], [7, 4]].map(([x, y]) => [x * dir, y]);
    const o = tear(spline(keys.map(T), 4), seed * 31 + s, { amp: 0.4, jag: 0.6, wander: 1.6 });
    const iP = spline(inner.map(T), 4);
    const lines = [0.38, 0.05, -0.3].map((f, i) => [[8 * dir, f * 6], [L * 0.5 * dir, f * h * 0.7 + lift * 0.4], [L * 0.9 * dir, f * h * 0.8 + lift]]);
    return `<path d="${path(o)}" ${fill('raffia')} filter="url(#tg-thin)"/>
      <path d="${path(iP)}" ${fill('raffiaDeep')} opacity="0.55"/>
      ${lines.map((ln, i) => crinkle(ln, seed * 7 + s * 3 + i)).join('')}`;
  };
  const tail = (dir, s) => {
    // a strip from under the knot, falling out and down; its end cut in a V
    const A = [3 * dir, 6], B = [34 * dir, 42], w0 = 12, w1 = 15;
    const u = unit(sub(B, A)), n = [-u[1], u[0]];
    const pts = [add(A, mul(n, w0 / 2)), add(add(A, mul(sub(B, A), 0.5)), mul(n, w0 / 2 + 1.5 * dir)), add(B, mul(n, w1 / 2)),
      add(sub(B, mul(u, 7)), [0, 0]), add(B, mul(n, -w1 / 2)), add(add(A, mul(sub(B, A), 0.5)), mul(n, -w0 / 2)), add(A, mul(n, -w0 / 2))];
    const o = tear(poly(pts.map(T), 3), seed * 41 + s, { amp: 0.3, jag: 0.45, wander: 1 });
    return `<path d="${path(o)}" ${fill('raffia')} filter="url(#tg-thin)"/>
      ${crinkle([[3 * dir, 9], [18 * dir, 30], [31 * dir, 46]], seed * 9 + s, 0.3)}`;
  };
  // the strand that runs from the knot down into the eyelet, and the one up over the top edge
  const into = tear(poly([[-4, 6], [4, 6], [4.5, 36], [-4.5, 36]].map(T), 3), seed * 51, { amp: 0, jag: 0.4, wander: 0.6 });
  const over = tear(poly([[-4, -6], [4, -6], [5, -26], [-3, -27]].map(T), 3), seed * 52, { amp: 0, jag: 0.4, wander: 0.6 });
  const knotKeys = [[-9, -9], [0, -11.5], [9, -9], [11, 0], [9, 10], [0, 12], [-9, 10], [-11, 0]];
  const knot = tear(spline(knotKeys.map(T), 3), seed * 53, { amp: 0, jag: 0.5, wander: 0.8 });
  return `<path d="${path(over)}" ${fill('raffia')} filter="url(#tg-thin)"/>
    <path d="${path(into)}" ${fill('raffia')} filter="url(#tg-thin)"/>
    ${tail(-1, 1)}${tail(1, 2)}
    ${lobe(-1, 64, 40, 3)}${lobe(1, 68, 42, 4)}
    <path d="${path(knot)}" ${fill('raffia')} filter="url(#tg-thin)"/>
    ${crinkle([[-4, -8], [-5, 0], [-4, 8]], seed * 61, 0.4)}${crinkle([[4, -8], [3, 0], [4, 8]], seed * 62, 0.4)}`;
}

// An arm: a strip of deeper blue card pinned through its rounded end by a brass brad on the tag's face (set inside
// the edge), ending in the family's cream mitten. Geometry is baked at the angle asked for so the glue shadow keeps
// falling down-right; the engine rotates the part about the brad.
function stripPts(S, E, w0, w1, step = 4) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const ux = (E[0] - S[0]) / L, uy = (E[1] - S[1]) / L, nx = -uy, ny = ux;
  const m = Math.max(4, Math.round(L / step));
  const W = t => (w0 + (w1 - w0) * t) / 2;
  const pts = [];
  for (let i = 0; i <= m; i++) { const t = i / m, w = W(t); pts.push([S[0] + ux * L * t + nx * w, S[1] + uy * L * t + ny * w]); }
  pts.push([E[0] + ux * 3, E[1] + uy * 3]);
  for (let i = m; i >= 0; i--) { const t = i / m, w = W(t); pts.push([S[0] + ux * L * t - nx * w, S[1] + uy * L * t - ny * w]); }
  for (let k = 1; k < 9; k++) { const a = -Math.PI / 2 - (k / 9) * Math.PI; pts.push([S[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w0 / 2, S[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w0 / 2]); }
  return pts;
}
function mitten(G0, la, R, toward, seed) {
  // Tuck's round 2 mitten: a round mitt with a small thumb lobe on the side that faces the body, a torn V between
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
  const N = 110, raw = [];
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * Math.PI * 2 - Math.PI, dx = Math.cos(ph), dy = Math.sin(ph);
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
  return `<path d="${path(tear(pts, seed + 400, { jag: 0.25, wander: 1 }))}" ${fill('glove')} filter="url(#tg-thin)"/>`;
}
function arm(S, angleDeg, { D = G.armD, w = G.armW, R = G.gloveR, seed = 1, toward = [G.cx, 330], hold = null } = {}) {
  const a = angleDeg * D2R;
  const L = D - R * 0.5;
  const W = [S[0] + Math.cos(a) * L, S[1] + Math.sin(a) * L];
  const G0 = [W[0] + Math.cos(a) * R * 0.5, W[1] + Math.sin(a) * R * 0.5];
  const strip = tear(stripPts(S, W, w, w * 0.86), seed * 7, { amp: 0.2, jag: 0.35, wander: 1.1 });
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, sgn = ux >= 0 ? 1 : -1;
  const p = t => [S[0] + ux * L * t + nx * sgn * (w / 2 - 4), S[1] + uy * L * t + ny * sgn * (w / 2 - 4)];
  const side = pencil([p(0.2), p(0.55), p(0.9)], seed * 3, 1, 0.5)[0];
  return `<path d="${path(strip)}" ${fill('arm')} filter="url(#tg-card)"/>
    <g ${stroke('graphite')} stroke-width="1" opacity="0.18" fill="none" stroke-linecap="round" filter="url(#tg-graphite)"><path d="${side}"/></g>
    ${hold === 'note' ? note(add(G0, [Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95 - 4]), seed, 1.25, -14) : ''}
    ${mitten(G0, a, R, toward, seed)}
    ${brad(S[0], S[1])}`;
}
// a small folded note, cream, one pencil line on it (vignettes)
export function note(c, seed = 1, k = 1, tilt = -8) {
  const T = p => rot([c[0] + p[0] * k, c[1] + p[1] * k], c, tilt);
  const front = tear(poly([[-24, -15], [22, -17], [24, 13], [-22, 15]].map(T), 3), seed * 71, { amp: 0, jag: 0.4, wander: 0.8 });
  const fold = [[-24, -15], [22, -17]].map(T);
  const ln = pencil([[-14, 1], [-2, -1], [12, 0]].map(T), seed * 73, 2, 0.4);
  return `<path d="${path(front)}" ${fill('noteP')} filter="url(#tg-thin)"/>
    <g ${stroke('graphite')} stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.4" filter="url(#tg-graphite)">${ln.map(q => `<path d="${q}"/>`).join('')}<path d="M${fmt(fold[0][0])},${fmt(fold[0][1] + 3)} L${fmt(fold[1][0])},${fmt(fold[1][1] + 3)}" opacity="0.6"/></g>`;
}

// A leg: two strips of the same deeper blue card as the arms, joined at the knee by a small brass brad — a jointed
// paper puppet's leg, never a tube — from the hip (tucked a little under the card) down to a torn sole.
// `angleDeg` 90 = straight down. The engine swings the whole leg about the hip; the knee is drawn, not bent.
function leg(PFX, hip, angleDeg, { len = G.legLen, seed = 1, out = -1, knee = 0.5 } = {}) {
  const a = angleDeg * D2R, u = [Math.cos(a), Math.sin(a)];
  const top = sub(hip, mul(u, 14));
  const Kn = add(hip, mul(u, len * knee));
  const A = add(hip, mul(u, len));
  const upper = tear(stripPts(Kn, top, 22, 25), seed * 11, { amp: 0.2, jag: 0.35, wander: 0.9 });
  const lower = tear(stripPts(Kn, add(A, mul(u, -2)), 22, 19), seed * 13, { amp: 0.2, jag: 0.35, wander: 0.9 });
  // a faint pencil line down each strip's shadow side: flat strips, not tubes
  const n = [-u[1], u[0]];
  const sideLine = (P0, P1, w, s) => pencil([add(P0, mul(n, -(w / 2 - 4))), add(mul(add(P0, P1), 0.5), mul(n, -(w / 2 - 4))), add(P1, mul(n, -(w / 2 - 4)))], s, 1, 0.4)[0];
  const lines = [sideLine(add(top, mul(u, 18)), add(Kn, mul(u, -14)), 24, seed * 5), sideLine(add(Kn, mul(u, 14)), add(A, mul(u, -8)), 20, seed * 6)];
  // the torn sole, its toe turned outward (keys drawn with the toe toward +x, mirrored for a toe turned left)
  const F = add(A, [out * 10, 7]);
  const footKeys = [[-22, 1], [-11, -8], [12, -9], [29, -1], [23, 9], [-2, 11], [-20, 10]].map(([x, y]) => [F[0] + x * out, F[1] + y]);
  const foot = tear(spline(footKeys, 5), seed + 50, { jag: 1, wander: 3 });
  return `<path d="${path(upper)}" ${fill('legA')} filter="url(#tg-card)"/>
    <path d="${path(lower)}" ${fill('legA')} filter="url(#tg-card)"/>
    <g ${stroke('graphite')} stroke-width="1" fill="none" stroke-linecap="round" opacity="0.2" filter="url(#tg-graphite)">${lines.map(q => `<path d="${q}"/>`).join('')}</g>
    ${brad(Kn[0], Kn[1], 5.6)}
    <path d="${path(foot)}" ${fill('foot')} filter="url(#tg-paper)"/>`;
}

// eyes, mouth, cheeks: one pencil, as Tuck's
function eye(cx, cy, { rx = 9.8, ry = 12.8, seed = 1, closed = false, tilt = 0, look = [0, 0] } = {}) {
  const pg = (pts, sw, s2, op = 1) => `<g ${stroke('graphite')} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#tg-graphite)">${pencil(pts, s2, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
  if (closed) return pg([[cx - rx * 1.25, cy + 4], [cx - rx * 0.55, cy - ry * 0.45], [cx + rx * 0.55, cy - ry * 0.45], [cx + rx * 1.25, cy + 4]], 2.8, seed);
  const x = cx + look[0], y = cy + look[1];
  const oval = tear(ellipse(x, y, rx, ry, 22, tilt), seed, { jag: 0.25, wander: 0.5 });
  return `<path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#tg-graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.4" fill="none" opacity="0.7" filter="url(#tg-graphite)">${pencil([...oval, oval[0], oval[1]], seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
    <ellipse cx="${fmt(x - rx * 0.34)}" cy="${fmt(y - ry * 0.36)}" rx="${fmt(rx * 0.32)}" ry="${fmt(ry * 0.27)}" ${fill('glint')} opacity="0.92"/>`;
}
function mouth(kind = 'smile') {
  const [mx, my] = G.mouth;
  if (kind === 'o') return `<ellipse cx="${mx}" cy="${my + 1}" rx="4.6" ry="5.6" ${fill('graphite')} opacity="0.9" filter="url(#tg-graphite-fill)"/>`;
  const pts = kind === 'soft' ? [[mx - 8, my], [mx, my + 3], [mx + 8, my - 1]] : [[mx - 9, my - 3], [mx - 4, my + 2.5], [mx + 4, my + 2.5], [mx + 9, my - 3]];
  return `<g ${stroke('graphite')} stroke-width="2.2" fill="none" stroke-linecap="round" filter="url(#tg-graphite)">${pencil(pts, 17, 3, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>`;
}
function cheeks(op = 0.8) {
  const hatch = ([cx, cy], seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 8.5 + i * 8.5; d += pencil([[x - 4, cy + 7], [x + 4, cy - 7]], seed + i, 2, 0.55).map(q => `<path d="${q}"/>`).join(''); }
    return `<g ${stroke('blush')} stroke-width="4.3" fill="none" stroke-linecap="round" filter="url(#tg-crayon)">${d}</g>`;
  };
  return `<g opacity="${op}">${hatch(G.cheekL, 501)}${hatch(G.cheekR, 511)}</g>`;
}

// ---------- assembling ----------
// Every part as an SVG string, at the pose asked for. Coordinates are rig units; transforms for tilt/look are applied
// by the caller (rig at rest needs none).
export function parts(P = 'tg-', pose = {}) {
  const o = { armL: G.armRest[0], armR: G.armRest[1], legL: G.legRest[0], legR: G.legRest[1], closed: false, mouth: 'smile', blush: 0.8,
    perk: 0, bowTilt: -3, holdL: null, holdR: null, look: [0, 0], ...pose };
  return {
    shadow: `<ellipse cx="350" cy="701" rx="104" ry="11" ${fill('graphite')} opacity="0.11" filter="url(#tg-crayon)"/>`,
    'leg-l': leg(P, G.hipL, o.legL, { seed: 5, out: -1 }),
    'leg-r': leg(P, G.hipR, o.legR, { seed: 9, out: 1 }),
    torso: torso(P, false),
    'torso-alt': torso(P, true),
    deco: bow(G.knot, { tiltDeg: o.bowTilt, perk: o.perk, seed: 3 }),
    cheeks: cheeks(o.blush),
    'eye-l': eye(...G.eyeL, { seed: 71, tilt: -0.06, look: o.look }),
    'eye-r': eye(...G.eyeR, { rx: 9.3, ry: 12.3, seed: 72, tilt: 0.08, look: o.look }),
    'eye-l-shut': eye(...G.eyeL, { seed: 71, closed: true }),
    'eye-r-shut': eye(...G.eyeR, { rx: 9.3, ry: 12.3, seed: 72, closed: true }),
    mouth: mouth(o.mouth === 'o' ? 'smile' : o.mouth),
    'mouth-o': mouth('o'),
    'arm-l': arm(G.bradL, o.armL, { seed: 91, hold: o.holdL }),
    'arm-r': arm(G.bradR, o.armR, { seed: 92, hold: o.holdR }),
  };
}

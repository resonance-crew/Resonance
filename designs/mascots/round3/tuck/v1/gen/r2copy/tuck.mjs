// 摺摺 Tuck (round 2, C′) — a torn-paper collage creature. Builds the defs and the layered character.
// Round 2 changes only the arms: each arm is now a strip of the feet's darker sage offcut, pinned
// to the sheet with one small brass brad (the shoulder pivot), long enough to lift its hand above
// its head, and ending in a round glove torn from the same cream paper as the flap's back, with a
// little of the hidden pencil writing on it. Body, flap, face, legs, feet, tears, grain: as round 1.
import { rng, spline, poly, tear, path, smoothPath, reflect, side, pencil, ellipse } from './lib.mjs';

// Every paper colour is a custom property with its day value as the fallback (`--c2-body`, …),
// so a theme (sage / lavender / yellow) or a night override can recolour the sheets without
// regenerating. The fibre rim, glue shadow and specks live in the filters and stay as they are.
export const C = {
  body: 'oklch(80% 0.044 140)',      // sage coloured paper, front
  bodyDeep: 'oklch(68% 0.045 142)',    // the same sheet's offcut (feet)
  back: 'oklch(94.5% 0.02 86)',       // the white side of the coloured paper (flap's back)
  hand: 'oklch(89% 0.032 32)',       // round 1's pale rose scrap (kept only for the comparison sheet)
  arm: 'oklch(70% 0.047 143)',       // round 2: the arm strip, cut from the same darker offcut as the feet
  glove: 'oklch(93% 0.026 86)',      // round 2: the glove, the flap's cream paper (a touch older)
  brass: 'oklch(73% 0.085 82)',      // the brad's head
  brassDeep: 'oklch(50% 0.06 68)',   // its rim
  brassHi: 'oklch(94% 0.035 92)',    // its glint
  // round 2 revision: the accordion legs are wheat paper (the card family's hue 88), not rose:
  // the only pink on the figure is gone, and wheat sits beside sage, cream and brass as one paper box
  legA: 'oklch(86% 0.066 88)',
  legB: 'oklch(75.5% 0.075 82)',
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(69% 0.1 38)',       // round 2: a terracotta crayon, drawn as three short strokes
  rim: 'oklch(97.5% 0.012 85)',
};
const VAR = { body: 'body', bodyDeep: 'foot', back: 'flap-back', hand: 'hand', arm: 'arm', glove: 'glove', brass: 'brad', brassDeep: 'brad-rim', brassHi: 'brad-glint', legA: 'leg', legB: 'leg-fold', graphite: 'ink', blush: 'blush', glint: 'glint' };
const fill = (k, v) => `style="fill:${v || `var(--c2-${VAR[k]}, ${C[k]})`}"`;
const stroke = (k, v) => `style="stroke:${v || `var(--c2-${VAR[k]}, ${C[k]})`}"`;

export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-300" y="-300" width="2200" height="1600"';
  return `<defs>
  <!-- torn paper: a slightly displaced edge, the white fibres the tear exposes, a glue shadow, a few fibre specks inside -->
  <filter id="c2-paper" ${U} color-interpolation-filters="sRGB">
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
  <!-- thin paper (small scraps): same tear, a fainter shadow, a narrower rim, no specks -->
  <filter id="c2-thin" ${U} color-interpolation-filters="sRGB">
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
  <filter id="c2-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- graphite fill: a pencil-filled shape, denser than a line, still a little grainy at the edge -->
  <filter id="c2-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- crayon: soft waxy blush with gaps -->
  <filter id="c2-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <!-- a softer crayon for small shadows (the brad's) -->
  <filter id="c2-crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.2" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <!-- brass: a matte brad head, a little uneven, with a faint grain -->
  <filter id="c2-metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
</defs>`;
}

const fmt = n => n.toFixed(1);
export let HAND = 'petal', TAB = 'stub', TABFILL = 'body';
export const setShapes = (h, t, f = 'body') => { HAND = h; TAB = t; TABFILL = f; };

// An accordion-folded strip leg from a hip down. Its foot is returned apart: a foot is its own part.
function leg(id, footId, hx, hy, len, { panels = 7, zig = 7, w = 28, lean = 0, seed = 1, flip = 1, squash = 1, footTilt = 0 } = {}) {
  const r = rng(seed);
  const ph = len / panels;
  const folds = [];
  for (let i = 0; i <= panels; i++) {
    const t = i / panels;
    const cx = hx + lean * t + (i % 2 ? zig : -zig) * flip * (i === 0 ? 0.3 : 1);
    const cy = hy + i * ph;
    const tilt = (r() - 0.5) * 3;
    folds.push([[cx - w / 2, cy - tilt], [cx + w / 2, cy + tilt]]);
  }
  let s = '';
  for (let i = 0; i < panels; i++) {
    const [a, b] = folds[i], [c, d] = folds[i + 1];
    const shape = tear(poly([a, b, d, c], 4.5), seed * 10 + i, { jag: 0.8, wander: 2 });
    s += `<path d="${path(shape)}" ${fill(i % 2 ? 'legA' : 'legB')}/>`;
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
  const sole = [fx + 1, fy + 10];
  const dy = (squash - 1) * len; // the leg's bottom end moves by (scaleY − 1) × length under its hip pivot
  const legT = squash === 1 ? '' : ` transform="translate(${fmt(hx)} ${fmt(hy)}) scale(1 ${squash}) translate(${fmt(-hx)} ${fmt(-hy)})"`;
  const footT = dy === 0 && !footTilt ? '' : ` transform="translate(0 ${fmt(dy)})${footTilt ? ` rotate(${footTilt} ${fmt(sole[0])} ${fmt(sole[1])})` : ''}"`;
  const legSvg = `<g id="${id}"${legT}><!-- pivot: ${fmt(hx)},${fmt(hy)} (hip). scaleY 0.55 to 1.1 squeezes or stretches the accordion; length ${len}, bottom end at ${fmt(bx)},${fmt(by)} -->
    <g filter="url(#c2-paper)">${s}</g>
    <g ${stroke('graphite')} stroke-width="1.1" stroke-opacity="0.45" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${lines}</g>
  </g>`;
  const footSvg = `<g id="${footId}"${footT}><!-- pivot: ${fmt(sole[0])},${fmt(sole[1])} (sole centre). Never scaled. Follows its leg: translate(0, (legScaleY − 1) × ${len}); if the leg rotates, it rides the leg's bottom end ${fmt(bx)},${fmt(by)} and may tilt ±10° about this pivot to plant flat -->
    <path d="${path(foot)}" ${fill('bodyDeep')} filter="url(#c2-paper)"/>
  </g>`;
  return { legSvg, footSvg };
}

// Round 2 arm: a torn paper strip pinned to the sheet by a brass brad at the shoulder, ending in a
// round glove. The strip is a chain of segments: one for Tuck, two (with an elbow brad) for the
// comparison sheet. Geometry is baked in the group's own coordinates at the pose angle, so the glue
// shadow keeps falling down-right; an animator rotates the group about the shoulder pivot.
const D2R = Math.PI / 180;
function stripPts(S, E, w0, w1, bend, capEnd, step = 4) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const ux = (E[0] - S[0]) / L, uy = (E[1] - S[1]) / L, nx = -uy, ny = ux;
  const m = Math.max(4, Math.round(L / step));
  const C = t => { const b = Math.sin(Math.PI * t) * bend; return [S[0] + ux * L * t + nx * b, S[1] + uy * L * t + ny * b]; };
  const W = t => (w0 + (w1 - w0) * t) / 2;
  const pts = [];
  for (let i = 0; i <= m; i++) { const t = i / m, c = C(t), w = W(t); pts.push([c[0] + nx * w, c[1] + ny * w]); }
  if (capEnd) {
    for (let k = 1; k < 8; k++) { const a = Math.PI / 2 - (k / 8) * Math.PI; pts.push([E[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w1 / 2, E[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w1 / 2]); }
  } else {
    pts.push([E[0] + ux * 3, E[1] + uy * 3]);
  }
  for (let i = m; i >= 0; i--) { const t = i / m, c = C(t), w = W(t); pts.push([c[0] - nx * w, c[1] - ny * w]); }
  // the shoulder end is rounded: that is where the brad goes through
  for (let k = 1; k < 9; k++) { const a = -Math.PI / 2 - (k / 9) * Math.PI; pts.push([S[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w0 / 2, S[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w0 / 2]); }
  return pts;
}
function brad(id, x, y, r = 8.6, { note = '' } = {}) {
  return `<g id="${id}"><!-- pivot: ${fmt(x)},${fmt(y)}. The pin the arm turns on${note}; it does not rotate with the arm -->
      <circle cx="${fmt(x + 1.3)}" cy="${fmt(y + 2)}" r="${fmt(r + 0.6)}" fill="oklch(28% 0.03 55)" opacity="0.28" filter="url(#c2-crayon-soft)"/>
      <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" ${fill('brass')} filter="url(#c2-metal)"/>
      <path d="M${fmt(x + r * 0.95)},${fmt(y - r * 0.2)} A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x - r * 0.35)},${fmt(y + r * 0.93)}" fill="none" ${stroke('brassDeep')} stroke-width="1.6" stroke-linecap="round" opacity="0.8" filter="url(#c2-graphite)"/>
      <ellipse cx="${fmt(x - r * 0.32)}" cy="${fmt(y - r * 0.36)}" rx="${fmt(r * 0.34)}" ry="${fmt(r * 0.24)}" transform="rotate(-30 ${fmt(x - r * 0.32)} ${fmt(y - r * 0.36)})" ${fill('brassHi')} opacity="0.9"/>
    </g>`;
}
function paperArm(P, sk, sx, sy, angleDeg, D, {
  width = 32, glove = 30, seed = 1, bend = 0, color, gloveColor, hand = 'round', elbow = null, writing = true, wave = 0, ...o2
} = {}) {
  const S = [sx, sy];
  const a = angleDeg * D2R;
  // joints along the arm: shoulder → (elbow) → wrist; the glove's centre sits a little past the wrist
  const segs = [];
  if (elbow) {
    const E1 = [sx + Math.cos(a) * D * elbow.at, sy + Math.sin(a) * D * elbow.at];
    const a2 = (angleDeg + elbow.bend) * D2R;
    const rest = D * (1 - elbow.at) - glove * 0.5;
    segs.push([S, E1, width, width * 0.94, bend, true]);
    segs.push([E1, [E1[0] + Math.cos(a2) * rest, E1[1] + Math.sin(a2) * rest], width * 0.94, width * 0.86, 0, false]);
  } else {
    const L = D - glove * 0.5;
    segs.push([S, [sx + Math.cos(a) * L, sy + Math.sin(a) * L], width, width * 0.86, bend, false]);
  }
  const last = segs[segs.length - 1];
  const W = last[1];
  const la = Math.atan2(W[1] - last[0][1], W[0] - last[0][0]);
  const G = [W[0] + Math.cos(la) * glove * 0.5, W[1] + Math.sin(la) * glove * 0.5];
  const strips = segs.map((sg, i) => `<path d="${path(tear(stripPts(sg[0], sg[1], sg[2], sg[3], sg[4], sg[5]), seed * 7 + i, { jag: 0.55, wander: 1.8 }))}" ${fill('arm', color)} filter="url(#c2-paper)"/>`).join('');
  // a faint pencil line down the strip's shadow side: it is a flat strip, not a tube
  const s0 = segs[0];
  const strokeSide = segs.map((sg, i) => {
    const [A, B, w0, w1] = sg;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy, ny = ux;
    const sgn = ux >= 0 ? 1 : -1; // the lower edge
    const p = t => [A[0] + ux * L * t + nx * sgn * (w0 / 2 - 4), A[1] + uy * L * t + ny * sgn * (w0 / 2 - 4)];
    return pencil([p(0.12), p(0.5), p(0.92)], seed * 3 + i, 1, 0.5)[0];
  }).map(d => `<path d="${d}"/>`).join('');
  let handSvg;
  const gid = `${P}glove-${sk}`;
  if (hand === 'mitten') {
    // round 2 revision: a mitten torn from the cream paper. A round mitt with a small thumb lobe on the side that
    // faces the body, the lobe tipped toward the fingertips so a torn V notch opens between it and the mitt; one
    // faint pencil line is all that is left of the writing (the lines and the hatching made a cotton pad of it)
    const R = glove;
    const toBody = Math.sign((-Math.sin(la)) * (404 - G[0]) + Math.cos(la) * (414 - G[1])) || 1;
    const ts = o2.thumb ?? toBody;
    // shapes in the glove's own frame: x along the arm (toward the fingertips), y across it (thumb side = ts)
    const mitt = { cx: R * 0.06, cy: -ts * R * 0.04, a: R * 1.0, b: R * 0.9, rot: 0 };
    const thumb = { cx: -R * 0.08, cy: ts * R * 0.83, a: R * 0.45, b: R * 0.31, rot: ts * 0.75 };
    const hit = (e, dx, dy) => { // farthest t ≥ 0 where the ray t·(dx,dy) from the glove centre leaves ellipse e
      const c = Math.cos(e.rot), s = Math.sin(e.rot);
      const ox = (-e.cx) * c + (-e.cy) * s, oy = -(-e.cx) * s + (-e.cy) * c;
      const vx = dx * c + dy * s, vy = -dx * s + dy * c;
      const A2 = vx * vx / (e.a * e.a) + vy * vy / (e.b * e.b), B2 = 2 * (ox * vx / (e.a * e.a) + oy * vy / (e.b * e.b)), C2 = ox * ox / (e.a * e.a) + oy * oy / (e.b * e.b) - 1;
      const disc = B2 * B2 - 4 * A2 * C2;
      return disc < 0 ? 0 : Math.max(0, (-B2 + Math.sqrt(disc)) / (2 * A2));
    };
    const N = 120;
    const raw = [];
    for (let i = 0; i < N; i++) {
      const ph = (i / N) * Math.PI * 2 - Math.PI;
      const dx = Math.cos(ph), dy = Math.sin(ph);
      const rm = hit(mitt, dx, dy), rt = hit(thumb, dx, dy);
      raw.push({ ph, r: Math.max(rm, rt), thumb: rt > rm });
    }
    // the torn notch: a crisp V where the thumb's fingertip side meets the mitt
    let phJ = null;
    for (let i = 0; i < N; i++) {
      const a = raw[i], b = raw[(i + 1) % N];
      const nearSide = ts > 0 ? (!a.thumb && b.thumb) : (a.thumb && !b.thumb);
      if (nearSide && Math.abs(a.ph) < Math.PI / 1.4) phJ = ts > 0 ? b.ph : a.ph;
    }
    const pts = raw.map(({ ph, r }) => {
      if (phJ !== null) { const d = Math.abs(Math.atan2(Math.sin(ph - phJ), Math.cos(ph - phJ))); r -= R * 0.2 * Math.max(0, 1 - d / 0.13); }
      const dx = Math.cos(ph), dy = Math.sin(ph);
      return [G[0] + Math.cos(la) * dx * r - Math.sin(la) * dy * r, G[1] + Math.sin(la) * dx * r + Math.cos(la) * dy * r];
    });
    const g = tear(pts, seed + 400, { jag: 0.25, wander: 1 });
    let ink = '';
    if (writing) {
      // one line of somebody's handwriting, running across the mitt as it ran across the page it was torn from
      const ang = la * 180 / Math.PI + 90 + ts * 6;
      // a single ruled pencil line that runs off both torn edges (clipped): the page it was torn from. A plain line,
      // no loops — loops of handwriting on a round scrap read as a little sleeping face
      const off = R * 0.3; // toward the fingertips, away from the mitt's middle
      const lx = G[0] + Math.cos(la) * off, ly = G[1] + Math.sin(la) * off;
      const rl = rng(seed * 13 + 5);
      const line = [];
      for (let k = 0; k <= 8; k++) line.push([lx - R * 1.4 + k * R * 0.35, ly + (rl() - 0.5) * 1.4]);
      ink = pencil(line, seed * 13 + 6, 2, 0.35).map(d => `<path d="${d}"/>`).join('');
      ink = `<g clip-path="url(#${gid}-clip)"><g ${stroke('graphite')} stroke-width="0.9" fill="none" opacity="${o2.inkOpacity ?? 0.2}" stroke-linecap="round" filter="url(#c2-graphite)" transform="rotate(${fmt(ang)} ${fmt(lx)} ${fmt(ly)})">${ink}</g></g>`;
    }
    handSvg = `<clipPath id="${gid}-clip"><path d="${path(g)}"/></clipPath>
      <path d="${path(g)}" ${fill('glove', gloveColor)} filter="url(#c2-thin)"/>
      ${ink}`;
  } else if (hand === 'round') {
    const g = tear(ellipse(G[0], G[1], glove, glove * 0.95, 44, la), seed + 400, { jag: 0.35, wander: 1.6 });
    let ink = '';
    if (writing) {
      const r = rng(seed + 9);
      const ang = (r() - 0.5) * 24 - 6 + wave;
      for (let k = 0; k < 3; k++) ink += scribbleLine(G[0] - glove * 0.95 + (k % 2) * 6, G[1] - glove * 0.3 + k * glove * 0.42, glove * (k === 2 ? 1.1 : 1.9), seed * 13 + k, 3.0);
      ink = `<g clip-path="url(#${gid}-clip)"><g ${stroke('graphite')} stroke-width="0.9" fill="none" opacity="${o2.inkOpacity ?? 0.42}" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${fmt(ang)} ${fmt(G[0])} ${fmt(G[1])})">${ink}</g></g>`;
    }
    // a few pencil strokes along its lower right: a round, flat paper glove, not a ball
    const hat = [];
    for (let i = 0; i < 7; i++) {
      const t = -0.25 + i * 0.22;
      const cx = G[0] + Math.cos(t) * glove * 0.78, cy = G[1] + Math.sin(t) * glove * 0.78;
      hat.push(pencil([[cx - 3, cy - 6], [cx + 3, cy + 6]], seed + 600 + i, 1, 0.4)[0]);
    }
    handSvg = `<clipPath id="${gid}-clip"><path d="${path(g)}"/></clipPath>
      <path d="${path(g)}" ${fill('glove', gloveColor)} filter="url(#c2-thin)"/>
      ${ink}
      <g clip-path="url(#${gid}-clip)" ${stroke('graphite')} stroke-width="1.1" opacity="0.22" fill="none" filter="url(#c2-graphite)">${hat.map(d => `<path d="${d}"/>`).join('')}</g>`;
  } else {
    // a square scrap with one corner folded back (the comparison sheet's third option)
    const h = glove * 0.95;
    const ca = Math.cos(la), sa = Math.sin(la);
    const R = (x, y) => [G[0] + x * ca - y * sa, G[1] + x * sa + y * ca];
    const sq = [R(-h, -h), R(h * 0.35, -h), R(h, -h * 0.35), R(h, h), R(-h, h)];
    const fold = [R(h * 0.35, -h), R(h * 0.35, -h * 0.35), R(h, -h * 0.35)];
    handSvg = `<path d="${path(tear(poly(sq, 4), seed + 400, { jag: 0.9, wander: 2 }))}" ${fill('glove', gloveColor)} filter="url(#c2-paper)"/>
      <path d="${path(fold)}" fill="oklch(86% 0.03 86)" filter="url(#c2-thin)"/>`;
  }
  const elbowBrad = elbow ? brad(`${P}brad-${sk}-elbow`, segs[0][1][0], segs[0][1][1], 6, { note: ' (elbow)' }) : '';
  return `<g id="${P}arm-${sk}"><!-- pivot: ${fmt(sx)},${fmt(sy)} (shoulder brad). Drawn at ${angleDeg}° (0° = pointing right, 90° = hanging straight down, −90° = straight up); to move it, rotate this group about the pivot. Shoulder to glove centre ${D}. Arm and hand turn together -->
    ${strips}
    <g ${stroke('graphite')} stroke-width="1" opacity="0.18" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${strokeSide}</g>
    ${elbowBrad}
    <g id="${P}hand-${sk}"><!-- pivot: ${fmt(W[0])},${fmt(W[1])} (wrist). Rides with the arm; waves ±12° about the wrist, squeezes to scale 0.92 on a clap -->
      ${handSvg}
    </g>
  </g>
  ${brad(`${P}brad-${sk}`, sx, sy)}`;
}

// Cursive-looking pencil loops (not letters): the lines hidden under the folded corner.
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

// An eye drawn straight onto the paper in pencil: a filled oval and one small dot of paper left white.
function eye(id, cx, cy, { rx = 10.5, ry = 13.5, look = [0, 0], seed = 1, closed = false, tilt = 0 } = {}) {
  const pencilG = (pts, sw, s2, op = 1) => `<g ${stroke('graphite')} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#c2-graphite)">${pencil(pts, s2, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
  if (closed) {
    const arc = [[cx - rx * 1.25, cy + 4], [cx - rx * 0.55, cy - ry * 0.45], [cx + rx * 0.55, cy - ry * 0.45], [cx + rx * 1.25, cy + 4]];
    return `<g id="${id}"><!-- pivot: ${fmt(cx)},${fmt(cy)} (closed: the oval swapped for a soft pencil arc) -->
      ${pencilG(arc, 3, seed)}
    </g>`;
  }
  const x = cx + look[0], y = cy + look[1];
  const oval = tear(ellipse(x, y, rx, ry, 22, tilt), seed, { jag: 0.25, wander: 0.5 });
  const ring = [...oval, oval[0], oval[1]];
  return `<g id="${id}"><!-- pivot: ${fmt(cx)},${fmt(cy)} (blink: scaleY 1 → 0.1 → 1 in 120ms; gaze: translate ±3, the face group adds ±6) -->
    <path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#c2-graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.5" fill="none" opacity="0.7" filter="url(#c2-graphite)">${pencil(ring, seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
    <g id="${id}-glint"><!-- rides with the eye; a 1px nudge against the gaze keeps it alive -->
      <ellipse cx="${fmt(x - rx * 0.34)}" cy="${fmt(y - ry * 0.36)}" rx="${fmt(rx * 0.32)}" ry="${fmt(ry * 0.27)}" ${fill('glint')} opacity="0.92"/>
    </g>
  </g>`;
}

// The whole creature. `pose` tweaks joints and face for the thumbnails.
const TABS = {
  stem: [[300, 284], [296, 252], [292, 236], [302, 226], [314, 230], [322, 224], [330, 236], [336, 266], [340, 290]],
  // wider and lower, leaning out to the left, a ragged top with two bites: a torn tab, not a stalk
  // a short tongue rooted along the top-left edge, leaning out: a torn tab, not a stalk
  lean: [[300, 302], [287, 288], [276, 270], [268, 252], [268, 241], [277, 234], [289, 233], [301, 239], [314, 254], [327, 270], [340, 284]],
  wide: [[294, 296], [284, 270], [276, 248], [288, 240], [296, 246], [306, 232], [318, 238], [330, 230], [340, 244], [344, 270], [350, 292]],
  // round 2 revision: narrower and shorter, still leaning out, its top a slanted torn cut with one small bite:
  // a scrap left over from the tear, never a round ear. The root runs under the sheet, so it stays attached
  stub: [[290.6, 299.8], [279.8, 283], [269, 266], [274.7, 258.8], [279.6, 261.4], [278.6, 254], [288.2, 241.6], [299, 254], [309, 266], [319.4, 278.2]],
};
// The main pose ("hi"), shared by character.svg, the concept sheet and the form check. Round 2 revision: the
// left-hand arm (the viewer's left) is the one raised, so the strip never crosses the dog-ear's tip; the sheet
// leans a little the other way and lifts the left foot
export const MAIN = { blushKind: 'hatch', armL: -114, armR: 76, tilt: 4, legSquashR: 1, legSquashL: 0.86 };
export function tuck(P = 'c2-', pose = {}) {
  const o = {
    tilt: -4, legSquashR: 0.84, flapS: 1, flapTilt: 0, look: [1, 0],
    // round 2 arms: angle in degrees (0 = right, 90 = down, −90 = up), D = shoulder brad to glove centre
    // round 2 revision: brads on the torn outline itself (so each strip hangs mostly outside the sheet), arms shorter
    // and much wider (50 at the shoulder, 43 at the wrist), a mitten 1.3–1.4× the strip's width
    armL: 106, armR: 76, armDL: 164, armDR: 164, armBendL: 3, armBendR: -3, shoulderL: [249, 420], shoulderR: [565, 430],
    armW: 50, gloveR: 31.5, armColor: undefined, gloveColor: undefined, handKind: 'mitten', elbowL: null, elbowR: null, gloveInk: false,
    blushKind: 'round',
    brow: 'lift', browOpacity: 0, mouth: 'smile', closed: false, legSquash: 1, legLean: [-8, 16], blush: 0.65, tear: false,
    bodyScaleY: 1, armsBehind: false,
    wrap: 'translate(400 410) scale(1.28) translate(-404 -462)', ...pose,
  };
  const keys = [[262, 352], [290, 296], [334, 264], [420, 250], [500, 250], [552, 268], [566, 360], [556, 470], [500, 552], [404, 578], [312, 562], [258, 494], [248, 420]];
  const body = tear(spline(keys, 8), 41, { jag: 1.3, wander: 11 });
  // the dog-ear: the top-right corner folded forward along the crease A–B
  const A = [428, 249], B = [566, 386];
  const theta = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
  let iStart = 0;
  for (let i = 0; i < body.length; i++) if (side(body[i], A, B) <= 0 && side(body[(i - 1 + body.length) % body.length], A, B) > 0) iStart = i;
  const ordered = body.map((_, i) => body[(iStart + i) % body.length]);
  const corner = ordered.filter(p => side(p, A, B) <= 0);
  const keep = ordered.filter(p => side(p, A, B) > 0);
  // the flap is drawn folded (its resting state): the corner reflected over the crease
  const flapPts = [A, ...corner.map(p => reflect(p, A, B)), B];
  const bodyD = path(keep);
  const flapD = path(flapPts);
  const s = o.flapS; // 1 = folded flat (white back up), 0 = standing on edge, -1 = laid open (coloured front up)
  const showBack = s > 0;
  const flapT = s === 1 && !o.flapTilt ? '' : ` transform="translate(${A[0]} ${A[1]}) rotate(${fmt(theta + o.flapTilt)}) scale(1 ${s}) rotate(${fmt(-theta)}) translate(${-A[0]} ${-A[1]})"`;

  // pencil shading along the lower right of the body (volume, not a 3D gradient)
  const hatches = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17, ang = -0.05 + t * 1.6;
    const cx = 405 + Math.cos(ang) * 152, cy = 412 + Math.sin(ang) * 170;
    hatches.push([[cx - 5, cy - 18], [cx + 6, cy + 8]]);
  }
  const hatchD = hatches.map((h, i) => pencil(h, 300 + i, 1, 0.6)[0]).map(d => `<path d="${d}"/>`).join('');

  // what the corner keeps covered: a few lines of somebody's pencil handwriting on the body itself
  let ink = '';
  // lines run full width; the flap's own outline (noteclip) trims them to the triangle it covers
  for (let k = 0; k < 10; k++) {
    const y = 270 + k * 12;
    ink += scribbleLine(444 + (k % 3) * 4, y, 126 - (k % 2) * 10, 170 + k, 3.6);
  }
  const note = `<g id="${P}note"><!-- the writing under the flap: hidden while it is folded, shown as it opens. No pivot: it never moves -->
      <clipPath id="${P}noteclip"><path d="${flapD}"/></clipPath>
      <g clip-path="url(#${P}bodyclip)"><g clip-path="url(#${P}noteclip)">
        <g ${stroke('graphite')} stroke-width="1.2" fill="none" opacity="0.6" stroke-linecap="round" filter="url(#c2-graphite)" transform="rotate(-3 500 320)">${ink}</g>
      </g></g>
    </g>`;
  const lift = `<path d="${flapD}" fill="oklch(28% 0.03 55)" opacity="${showBack ? 0.22 : 0}" transform="translate(3 6)" filter="url(#c2-crayon)"/>`;
  const creaseLine = `<g ${stroke('graphite')} stroke-width="1.6" fill="none" opacity="${s === 1 ? 0.38 : 0.45}" stroke-linecap="round" filter="url(#c2-graphite)">${pencil([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B], 404, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;

  const brows = {
    lift: [[[322, 362], [338, 354], [354, 357]], [[418, 357], [433, 352], [448, 357]]],
    worry: [[[324, 360], [338, 360], [352, 366]], [[418, 365], [432, 359], [446, 358]]],
  }[o.brow];
  const mouths = {
    smile: [[377, 440], [384, 446], [393, 446], [399, 440]],
    soft: [[379, 444], [388, 447], [397, 443]],
  };
  const mouth = o.mouth === 'o'
    ? `<ellipse cx="388" cy="444" rx="5" ry="6.2" ${fill('graphite')} opacity="0.9" filter="url(#c2-graphite-fill)"/>`
    : `<g ${stroke('graphite')} stroke-width="2.3" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${pencil(mouths[o.mouth], 17, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;

  // cheeks: round 1's round crayon blush, or (round 2) three short crayon strokes, so the face
  // stays off the "black ovals + ω + round red cheeks" formula
  const hatch = (cx, cy, seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 10 + i * 9.5; d += pencil([[x - 4.5, cy + 8], [x + 4.5, cy - 8]], seed + i, 2, 0.6).map(q => `<path d="${q}"/>`).join(''); }
    return `<g ${stroke('blush', o.blushColor)} stroke-width="4" fill="none" stroke-linecap="round" filter="url(#c2-crayon)">${d}</g>`;
  };
  const scrib = (cx, cy, seed) => {
    const r = rng(seed); const pts = [];
    for (let i = 0; i < 9; i++) { const t = i / 8; pts.push([cx - 14 + t * 28 + (r() - 0.5) * 2, cy + (i % 2 ? 6 : -6) * (1 - Math.abs(t - 0.5) * 0.9) + (r() - 0.5) * 2]); }
    return `<g ${stroke('blush', o.blushColor)} stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#c2-crayon)">${pencil(pts, seed, 2, 0.8).map(q => `<path d="${q}"/>`).join('')}</g>`;
  };
  const cheeks = o.blushKind === 'scribble'
    ? `<g id="${P}cheek-l" opacity="${o.blush}"><!-- pivot: 320,428 -->${scrib(320, 428, 501)}</g>
      <g id="${P}cheek-r" opacity="${o.blush}"><!-- pivot: 456,426 -->${scrib(456, 426, 511)}</g>`
    : o.blushKind === 'hatch'
    ? `<g id="${P}cheek-l" opacity="${o.blush}"><!-- pivot: 320,428 -->${hatch(320, 428, 501)}</g>
      <g id="${P}cheek-r" opacity="${o.blush}"><!-- pivot: 456,426 -->${hatch(456, 426, 511)}</g>`
    : `<g id="${P}cheek-l" opacity="${o.blush}"><!-- pivot: 320,428 --><ellipse cx="320" cy="428" rx="17" ry="10" ${fill('blush')} filter="url(#c2-crayon)"/></g>
      <g id="${P}cheek-r" opacity="${o.blush}"><!-- pivot: 456,426 --><ellipse cx="456" cy="426" rx="16" ry="9.5" ${fill('blush')} filter="url(#c2-crayon)"/></g>`;
  const tearDrop = o.tear ? `<g id="${P}tear"><path d="M447,410 q-6,11 0,16 q6,-5 0,-16Z" fill="oklch(92% 0.03 230)" stroke="${C.graphite}" stroke-width="1.2" opacity="0.92"/></g>` : '';

  const legL = leg(`${P}leg-l`, `${P}foot-l`, 358, 552, 114, { seed: 5, lean: o.legLean[0], flip: 1, squash: o.legSquash * (o.legSquashL ?? 1), footTilt: o.footTiltL || 0 });
  const legR = leg(`${P}leg-r`, `${P}foot-r`, 444, 556, 110, { seed: 9, lean: o.legLean[1], flip: -1, squash: o.legSquash * (o.legSquashR ?? 1), footTilt: o.footTiltR || 0 });
  const armOpt = { width: o.armW, glove: o.gloveR, color: o.armColor, gloveColor: o.gloveColor, hand: o.handKind, writing: o.gloveInk };
  const arms = `${paperArm(P, 'l', ...o.shoulderL, o.armL, o.armDL, { ...armOpt, seed: 91, bend: o.armBendL, elbow: o.elbowL })}
    ${paperArm(P, 'r', ...o.shoulderR, o.armR, o.armDR, { ...armOpt, seed: 92, bend: o.armBendR, elbow: o.elbowR })}`;
  const bodyT = `rotate(${o.tilt} 404 580)${o.bodyScaleY !== 1 ? ` translate(404 580) scale(1 ${o.bodyScaleY}) translate(-404 -580)` : ''}`;

  return `<g id="${P}tuck" transform="${o.wrap}"><!-- pivots below are in this group's own coordinates -->
  <g id="${P}shadow"><!-- pivot: 402,690 -->
    <ellipse cx="402" cy="690" rx="122" ry="12" fill="${C.graphite}" opacity="0.1" filter="url(#c2-crayon)"/>
  </g>
  ${legL.legSvg}
  ${legR.legSvg}
  ${legL.footSvg}
  ${legR.footSvg}
  <g id="${P}body" transform="${bodyT}"><!-- pivot: 404,580 (sway ±6°, breathe scaleY 1 → 0.985, squash on landing). Everything inside rides with it: tab, flap, face and both arms; legs and feet stay outside -->
    ${o.armsBehind ? arms : ''}
    <g id="${P}tab" transform="rotate(${o.tab ?? 0} 305 289)"><!-- pivot: 305,289 (root of the little torn tab left over from the tear, its top a slanted torn cut: perks up, droops, wiggles after a hop) -->
      <path d="${path(tear(poly(TABS[TAB], 5), 53, { jag: 1.3, wander: 4 }))}" ${fill(TABFILL)} filter="url(#c2-paper)"/>
    </g>
    <g id="${P}sheet"><!-- the body paper itself; no pivot of its own -->
      <path d="${bodyD}" ${fill('body')} filter="url(#c2-paper)"/>
      <clipPath id="${P}bodyclip"><path d="${bodyD}"/></clipPath>
      <g clip-path="url(#${P}bodyclip)" ${stroke('graphite')} stroke-width="1.2" opacity="0.17" fill="none" filter="url(#c2-graphite)">${hatchD}</g>
      <g clip-path="url(#${P}bodyclip)">
        <path d="M230,492 L600,470 L600,640 L230,640Z" fill="oklch(40% 0.04 140)" opacity="0.05"/>
        <path d="M230,492 L600,470" stroke="oklch(97% 0.015 100)" stroke-width="2" opacity="0.5" filter="url(#c2-graphite)"/>
        <path d="M230,494.5 L600,472.5" stroke="oklch(40% 0.04 140)" stroke-width="1" opacity="0.13"/>
      </g>
    </g>
    ${note}
    <g id="${P}flap"${flapT}><!-- pivot: ${A[0]},${A[1]}; crease ${A[0]},${A[1]} to ${B[0]},${B[1]} (θ = ${fmt(theta)}°). Drawn folded. Open / close = translate(${A[0]} ${A[1]}) rotate(θ) scale(1, s) rotate(−θ) translate(${-A[0]} ${-A[1]}), s from 1 (folded) through 0 (on edge) to −1 (laid open). While s > 0 show c-flap-back; once s crosses 0 hide it and show c-flap-front -->
      ${lift}
      <g id="${P}flap-back"${showBack ? '' : ' visibility="hidden"'}><!-- the white side of the coloured paper -->
        <path d="${flapD}" ${fill('back')} filter="url(#c2-paper)"/>
      </g>
      <g id="${P}flap-front"${showBack ? ' visibility="hidden"' : ''}><!-- the coloured side; seen once the corner is opened past its edge -->
        <path d="${flapD}" ${fill('body')} filter="url(#c2-paper)"/>
      </g>
    </g>
    ${creaseLine}
    <g id="${P}face"><!-- pivot: 388,410 (the face slides ±6 to look around) -->
      ${cheeks}
      ${eye(`${P}eye-l`, 340, 396, { rx: 10.5, ry: 13.5, look: o.look, seed: 71, closed: o.closed, tilt: -0.08 })}
      ${eye(`${P}eye-r`, 433, 394, { rx: 9.8, ry: 12.8, look: o.look, seed: 72, closed: o.closed, tilt: 0.1 })}
      <g id="${P}brow-l" opacity="${o.browOpacity}"><!-- pivot: 338,358. Hidden at rest (opacity 0): brows come in only for strong feelings (surprise, being moved, worry) -->
        <g ${stroke('graphite')} stroke-width="1.8" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${pencil(brows[0], 81, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}brow-r" opacity="${o.browOpacity}"><!-- pivot: 433,356. Hidden at rest, as brow-l -->
        <g ${stroke('graphite')} stroke-width="1.8" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${pencil(brows[1], 82, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}mouth"><!-- pivot: 388,444 -->${mouth}</g>
      ${tearDrop}
    </g>
    ${o.armsBehind ? '' : arms}
  </g>
</g>`;
}

// 點點 Pip — the little one of the 摺摺 series (round 3, prefix dt-).
//
// A circle punched out of someone's yellow legal-pad page: a clean punched edge that is still paper (the white rim, a
// small bur where the punch let go, the glue shadow down-right), one pale ruled line across its belly and the tail of
// somebody's handwritten word ("…ry") running off its edge. Its arms, legs and the curl on its head are all cut from one
// mustard quilling strip: two tiny strips pinned with brass brads inside the disc's edge, ending in the family's cream
// mittens; two tabs folded in a Z for legs; and the curl — the strip rolled into a loose coil and glued on top — its hair.
//
// Everything is drawn in the series' shared units (kit.md "Rig contract": viewBox 0 0 700 760, ground y = 700,
// centred on x = 350). `parts(pose)` returns the parts in paint order; rig.mjs writes them flat at rest with their
// pivots, concept.mjs composes them into poses the way the stage engine would (arms rebuilt at the pose angle so
// the glue shadow keeps falling down-right).
import { rng, spline, poly, tear, path, smoothPath, pencil, ellipse } from './lib.mjs';

// ---- shared parameters: the rig and the concept sheet read only these ----
export const P = {
  ground: 700,
  cx: 350, cy: 567, r: 98,                 // the punched disc: top at y 469, so ground → top of body = 231 (0.55 × Tuck's 420)
  hipY: 657, hipDX: 26,                     // the leg tabs are glued behind the disc, 8 units above its bottom (665)
  legLen: 31,                               // folded tab from hip to its last fold; the sole sits under it
  shoulderL: [273, 603], shoulderR: [427, 601], // brads: 30 under the mouth line, ~12 inside the edge (≈ 1.8 brad radii)
  armRestL: 128, armRestR: 52,              // at rest: relaxed down and a little out, mittens above the hips
  armLen: 43,                               // brad → mitten centre
  armW: 19, gloveR: 14.5,
  brad: 6.5,
  eyeL: [317, 548], eyeR: [381, 546], eyeRx: 7.6, eyeRy: 9.8,
  mouth: [349, 572],
  cheekL: [299, 568], cheekR: [399, 566],
  face: [349, 557],                         // data-face-center
  decoPivot: [350, 474],                    // where the curls sit on the head's edge
  torsoPivot: [350, 663],
  ruleY: 632, ruleTilt: -5,                 // the ruled line and the word that sits on it, turned as the dot was punched
};
export const HEIGHT = P.ground - (P.cy - P.r);

// Every paper colour is a custom property with its day value as the fallback (`--dt-body`, …), as Tuck's are.
export const C = {
  body: 'oklch(88.5% 0.102 96)',       // butter-yellow legal-pad paper
  strip: 'oklch(76% 0.108 84)',        // the mustard quilling strip: arms, leg tabs, the curl
  stripFold: 'oklch(67% 0.1 80)',      // the strip's folded-back face (the leg tabs' inner panels)
  sole: 'oklch(60% 0.085 78)',         // the soles: the strip's offcut, a shade deeper
  glove: 'oklch(93% 0.026 86)',        // the family's cream mitten paper
  brass: 'oklch(73% 0.085 82)', brassDeep: 'oklch(46% 0.06 66)', brassHi: 'oklch(94% 0.035 92)',
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(69% 0.1 38)',          // Tuck's terracotta crayon
  rule: 'oklch(64% 0.055 235)',        // the legal pad's pale blue-grey rule
  rim: 'oklch(97.5% 0.012 85)',
  shade: 'oklch(28% 0.03 55)',
};
const VAR = { body: 'body', strip: 'strip', stripFold: 'strip-fold', sole: 'sole', glove: 'glove', brass: 'brad', brassDeep: 'brad-rim', brassHi: 'brad-glint', graphite: 'ink', glint: 'glint', blush: 'blush', rule: 'rule' };
const fill = k => `style="fill:var(--dt-${VAR[k]}, ${C[k]})"`;
const stroke = k => `style="stroke:var(--dt-${VAR[k]}, ${C[k]})"`;
const f = n => n.toFixed(1);
const D2R = Math.PI / 180;
const paths = ds => ds.map(d => `<path d="${d}"/>`).join('');

// Tuck's filter recipes, copied under dt- ids. The disc and the strips are cut, not torn: the same fibre rim and glue
// shadow, a much smaller displacement. The mittens and soles are torn like Tuck's.
export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-200" y="-200" width="1100" height="1160"';
  const cut = (id, { disp, dil, fib, blur, dx, dy, op, specks, seed }) => `
  <filter id="${id}" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${disp}" xChannelSelector="R" yChannelSelector="G" result="cut"/>
    <feMorphology in="cut" operator="dilate" radius="${dil}" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="${seed + 1}" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="${fib}" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="${blur}" result="blur"/><feOffset dx="${dx}" dy="${dy}" result="off"/>
    <feFlood flood-color="${C.shade}" flood-opacity="${op}"/><feComposite in2="off" operator="in" result="shadow"/>
    ${specks ? `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed + 2}" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.33  0 0 0 0 0.2  4 0 0 0 -2.9" result="speck"/>
    <feComposite in="speck" in2="cut" operator="in" result="specks"/>` : ''}
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="${seed + 3}" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.93  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="cut" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="cut"/><feMergeNode in="mottles"/>${specks ? '<feMergeNode in="specks"/>' : ''}</feMerge>
  </filter>`;
  return `<defs>
  <!-- the punched disc: a clean cut edge (small displacement), the white fibre rim, the glue shadow, mottle and specks -->${cut('dt-punch', { disp: 1.2, dil: 1.5, fib: 2, blur: 3, dx: 3, dy: 5, op: 0.22, specks: true, seed: 17 })}
  <!-- the quilling strip (arms, leg tabs, curl): cut with scissors, a narrower rim, a fainter shadow -->${cut('dt-cut', { disp: 1, dil: 1.1, fib: 1.6, blur: 2, dx: 1.8, dy: 3.2, op: 0.2, specks: false, seed: 27 })}
  <!-- torn paper (the soles), Tuck's recipe -->
  <filter id="dt-paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.4" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.6" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="2.4" result="blur"/><feOffset dx="2" dy="3.6" result="off"/>
    <feFlood flood-color="${C.shade}" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- thin torn paper (the cream mittens), Tuck's recipe -->
  <filter id="dt-thin" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.15" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="2.2" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="1.8" result="blur"/><feOffset dx="1.5" dy="2.8" result="off"/>
    <feFlood flood-color="${C.shade}" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.45 0 0 0 -0.2" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- the mittens: torn from the same cream paper, a finer tear for a small scrap (the thin recipe frays it into cotton) -->
  <filter id="dt-mitt" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="1.3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="1.6" result="blur"/><feOffset dx="1.4" dy="2.6" result="off"/>
    <feFlood flood-color="${C.shade}" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.45 0 0 0 -0.2" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- graphite: a pencil line that skips over the tooth of the paper -->
  <filter id="dt-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.3" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- graphite fill: a pencil-filled shape (the eyes) -->
  <filter id="dt-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.4" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- crayon: soft waxy blush with gaps -->
  <filter id="dt-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3.5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
  <!-- a softer crayon for small shadows (the brad's, the ground's) -->
  <filter id="dt-crayon-soft" ${U}>
    <feGaussianBlur stdDeviation="1.1" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.5" result="gaps"/>
    <feComposite in="b" in2="gaps" operator="in"/>
  </filter>
  <!-- brass: a matte brad head with a faint grain -->
  <filter id="dt-metal" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="23" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="24" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.12  2.2 0 0 0 -1.25" result="grain"/>
    <feComposite in="grain" in2="d" operator="in" result="gr"/>
    <feMerge><feMergeNode in="d"/><feMergeNode in="gr"/></feMerge>
  </filter>
</defs>`;
}

// ---------------------------------------------------------------- the disc (torso)
function discOutline() {
  const { cx, cy, r } = P;
  const N = 160;
  const pts = [];
  // the bur: where the punch let go, low on the right, the edge frays out a little for a few degrees
  const burAt = 38 * D2R, burW = 7 * D2R;
  const rb = rng(61);
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const d = Math.abs(Math.atan2(Math.sin(t - burAt), Math.cos(t - burAt)));
    let rr = r;
    if (d < burW) rr += (1 - d / burW) * (1.2 + rb() * 3.4);
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
  }
  return pts;
}
// a few loose fibres standing off the bur
function burFibres() {
  const { cx, cy, r } = P;
  const rb = rng(73);
  let d = '';
  for (let i = 0; i < 4; i++) {
    const t = (34 + i * 2.6) * D2R;
    const x0 = cx + Math.cos(t) * (r + 1), y0 = cy + Math.sin(t) * (r + 1);
    const L = 3 + rb() * 3.5, a = t + (rb() - 0.5) * 0.9;
    d += `M${f(x0)},${f(y0)}q${f(Math.cos(a) * L * 0.5 + 1)},${f(Math.sin(a) * L * 0.5)} ${f(Math.cos(a) * L)},${f(Math.sin(a) * L)}`;
  }
  return `<path d="${d}" fill="none" stroke="${C.rim}" stroke-width="0.9" stroke-linecap="round" opacity="0.95"/>`;
}

// the tail of somebody's word in cursive ("…ory", the "o" cut by the punch), sitting on the ruled line
function handwriting(x0, B, s = 1.45) {
  const h = 12; // x-height before scaling
  const S = ([x, y]) => [x0 + x * s, B + y * s];
  const strokes = [
    // the "o", most of it lost past the edge
    [[-14, -h * 0.5], [-10, -h], [-5, -h * 0.9], [-3, -h * 0.45], [-6, 0.2], [-11, 0], [-14, -h * 0.5], [-9, -h * 0.95], [-2, -h * 1.02], [3, -h * 0.9]],
    // the "r": a little shoulder, a dip, then down to the line and away
    [[3, -h * 0.9], [5, -h * 1.15], [8, -h * 0.95], [10, -h * 1.02], [11, -h * 0.6], [11.5, 0], [14, -h * 0.25], [17, -h * 0.75]],
    // the "y": down, round, up, then the long tail below the line looping back
    [[17, -h * 0.75], [18, -h * 0.2], [20.5, 0.4], [24, -h * 0.25], [26, -h * 0.95], [26, -h * 0.1], [25.5, h * 0.55], [23, h * 0.95], [19.5, h * 0.8], [20.5, h * 0.3], [27, -h * 0.05], [34, -h * 0.35]],
  ];
  return strokes.map((st, i) => pencil(st.map(S), 880 + i, 2, 0.35).map(d => `<path d="${d}"/>`).join('')).join('');
}

function torso(ip) {
  const { cx, cy, r } = P;
  const disc = discOutline();
  const d = path(disc);
  const ruleL = [cx - r - 20, P.ruleY], ruleR = [cx + r + 20, P.ruleY];
  const rot = `rotate(${P.ruleTilt} ${cx} ${cy})`;
  return `<clipPath id="${ip}disc"><path d="${d}"/></clipPath>
    <path d="${d}" ${fill('body')} filter="url(#dt-punch)"/>
    <g clip-path="url(#${ip}disc)">
      <g transform="${rot}">
        <!-- the one ruled line a 6 mm punch can hold -->
        <path d="M${f(ruleL[0])},${f(ruleL[1])} L${f(ruleR[0])},${f(ruleR[1] + 0.8)}" fill="none" ${stroke('rule')} stroke-width="2.1" opacity="0.62" filter="url(#dt-graphite)"/>
        <!-- and the end of somebody's word sitting on it -->
        <g ${stroke('graphite')} stroke-width="1.4" fill="none" opacity="0.27" stroke-linecap="round" stroke-linejoin="round" filter="url(#dt-graphite)">${handwriting(281, P.ruleY - 1, 1.25)}</g>
      </g>
    </g>
    ${burFibres()}`;
}

// ---------------------------------------------------------------- the curl (deco): the strip rolled into a loose coil
function curlBand(center, r0, r1, a0, a1, w0, w1, base, seed) {
  // centreline: from `base` points into a spiral about `center`, radius r0 → r1 over angles a0 → a1 (degrees)
  const cl = base.length ? [...base] : [];
  const n = Math.max(12, Math.round(Math.abs(a1 - a0) / 7));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (a0 + (a1 - a0) * t) * D2R, rr = r0 + (r1 - r0) * t;
    cl.push([center[0] + Math.cos(a) * rr, center[1] + Math.sin(a) * rr]);
  }
  const sm = spline(cl, 2.5, false);
  const L = [], R = [];
  for (let i = 0; i < sm.length; i++) {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = (w0 + (w1 - w0) * (i / (sm.length - 1))) / 2;
    L.push([sm[i][0] - ty * w, sm[i][1] + tx * w]);
    R.push([sm[i][0] + ty * w, sm[i][1] - tx * w]);
  }
  // round the inner end, square-ish the glued end
  const e = sm[sm.length - 1], pe = sm[sm.length - 3];
  const ea = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
  const cap = [];
  for (let k = 1; k < 6; k++) { const a = ea + Math.PI / 2 - (k / 6) * Math.PI; cap.push([e[0] + Math.cos(a) * w1 / 2, e[1] + Math.sin(a) * w1 / 2]); }
  const outline = tear([...L, ...cap, ...R.reverse()], seed, { amp: 0.4, jag: 0.22, wander: 0.5 });
  return { outline, centre: sm };
}
function deco(ip, { lean = 0 } = {}) {
  // three loose coils of the strip, glued on their sides along the top of the head, each rolled the same way and a
  // size smaller than the last: a combed curl of hair. Each is open enough to see through, so it reads as a rolled
  // strip, not a button; three of them, stepping down to one side, never pair up into ears or horns
  const coils = [
    curlBand([377, 477], 9, 3.5, 75, -250, 7.5, 6, [], 303),
    curlBand([354, 465], 13.5, 4, 70, -310, 8.5, 6.5, [], 302),
    curlBand([326, 456], 20.5, 5.5, 55, -380, 10, 7, [], 301),
  ];
  const edge = (c, seed) => pencil(c.centre.filter((_, i) => i % 3 === 0).slice(2, -2), seed, 1, 0.3).map(d => `<path d="${d}"/>`).join('');
  return `<g transform="rotate(${lean} ${P.decoPivot[0]} ${P.decoPivot[1]})">
      ${coils.map((c, i) => `<path d="${path(c.outline)}" ${fill('strip')} filter="url(#dt-cut)"/>
      <g ${stroke('graphite')} stroke-width="0.9" fill="none" opacity="0.16" stroke-linecap="round" filter="url(#dt-graphite)">${edge(c, 330 + i)}</g>`).join('\n      ')}
    </g>`;
}

// ---------------------------------------------------------------- legs: a tab of the strip folded in a Z, and a sole
function leg(hx, hy, len, { flip = 1, seed = 1, w = 17, zig = 3.2, panels = 3, squash = 1 } = {}) {
  const r = rng(seed);
  const L = len * squash;
  const ph = L / panels;
  const folds = [];
  for (let i = 0; i <= panels; i++) {
    const cx = hx + (i % 2 ? zig : -zig) * flip * (i === 0 ? 0.3 : 1) + flip * i * 1.2;
    const cy = hy + i * ph;
    const tilt = (r() - 0.5) * 2.4;
    folds.push([[cx - w / 2, cy - tilt], [cx + w / 2, cy + tilt]]);
  }
  let s = '';
  for (let i = 0; i < panels; i++) {
    const [a, b] = folds[i], [c, d] = folds[i + 1];
    const shape = tear(poly([a, b, d, c], 3.5), seed * 10 + i, { amp: 0.6, jag: 0.4, wander: 1 });
    s += `<path d="${path(shape)}" ${fill(i % 2 ? 'stripFold' : 'strip')}/>`;
  }
  let lines = '';
  for (let i = 1; i < panels; i++) {
    const [a, b] = folds[i];
    lines += pencil([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.5], b], seed + i, 2, 0.4).map(d => `<path d="${d}"/>`).join('');
  }
  const end = folds[panels];
  const bx = (end[0][0] + end[1][0]) / 2, by = end[0][1];
  // the sole: a small torn oval sitting on the ground
  const fx = bx + 4 * flip, fy = P.ground - 5.5;
  const foot = tear(spline([[fx - 15, fy + 1], [fx - 7, fy - 5.5], [fx + 9, fy - 5.5], [fx + 16, fy + 1.5], [fx + 7, fy + 5.5], [fx - 9, fy + 5.5]], 3.5), seed + 50, { jag: 0.6, wander: 1.6 });
  return `<g filter="url(#dt-cut)">${s}</g>
    <g ${stroke('graphite')} stroke-width="0.9" stroke-opacity="0.45" fill="none" stroke-linecap="round" filter="url(#dt-graphite)">${lines}</g>
    <path d="${path(foot)}" ${fill('sole')} filter="url(#dt-paper)"/>`;
}

// ---------------------------------------------------------------- arms: a strip on a brad, ending in a mitten
function stripPts(S, E, w0, w1, step = 3) {
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
function brad(x, y, r = P.brad) {
  return `<circle cx="${f(x + 1.1)}" cy="${f(y + 1.6)}" r="${f(r + 0.5)}" fill="${C.shade}" opacity="0.3" filter="url(#dt-crayon-soft)"/>
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${fill('brass')} filter="url(#dt-metal)"/>
      <path d="M${f(x + r * 0.95)},${f(y - r * 0.2)} A${f(r)},${f(r)} 0 0 1 ${f(x - r * 0.35)},${f(y + r * 0.93)}" fill="none" ${stroke('brassDeep')} stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>
      <ellipse cx="${f(x - r * 0.32)}" cy="${f(y - r * 0.36)}" rx="${f(r * 0.34)}" ry="${f(r * 0.24)}" transform="rotate(-30 ${f(x - r * 0.32)} ${f(y - r * 0.36)})" ${fill('brassHi')} opacity="0.9"/>`;
}
// Tuck's mitten (round mitt + a thumb lobe on the body's side, a torn V between), at the dot's size
function mitten(G, la, R, seed) {
  const toBody = Math.sign((-Math.sin(la)) * (P.cx - G[0]) + Math.cos(la) * (P.cy - G[1])) || 1;
  const ts = toBody;
  const mitt = { cx: R * 0.06, cy: -ts * R * 0.04, a: R * 1.0, b: R * 0.9, rot: 0 };
  const thumb = { cx: -R * 0.06, cy: ts * R * 0.84, a: R * 0.47, b: R * 0.33, rot: ts * 0.75 };
  const hit = (e, dx, dy) => {
    const c = Math.cos(e.rot), s = Math.sin(e.rot);
    const ox = (-e.cx) * c + (-e.cy) * s, oy = -(-e.cx) * s + (-e.cy) * c;
    const vx = dx * c + dy * s, vy = -dx * s + dy * c;
    const A2 = vx * vx / (e.a * e.a) + vy * vy / (e.b * e.b), B2 = 2 * (ox * vx / (e.a * e.a) + oy * vy / (e.b * e.b)), C2 = ox * ox / (e.a * e.a) + oy * oy / (e.b * e.b) - 1;
    const disc = B2 * B2 - 4 * A2 * C2;
    return disc < 0 ? 0 : Math.max(0, (-B2 + Math.sqrt(disc)) / (2 * A2));
  };
  const N = 90, raw = [];
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * Math.PI * 2 - Math.PI, dx = Math.cos(ph), dy = Math.sin(ph);
    const rm = hit(mitt, dx, dy), rt = hit(thumb, dx, dy);
    raw.push({ ph, r: Math.max(rm, rt), thumb: rt > rm });
  }
  let phJ = null;
  for (let i = 0; i < N; i++) {
    const a = raw[i], b = raw[(i + 1) % N];
    const near = ts > 0 ? (!a.thumb && b.thumb) : (a.thumb && !b.thumb);
    if (near && Math.abs(a.ph) < Math.PI / 1.4) phJ = ts > 0 ? b.ph : a.ph;
  }
  const pts = raw.map(({ ph, r }) => {
    if (phJ !== null) { const d = Math.abs(Math.atan2(Math.sin(ph - phJ), Math.cos(ph - phJ))); r -= R * 0.2 * Math.max(0, 1 - d / 0.15); }
    const dx = Math.cos(ph), dy = Math.sin(ph);
    return [G[0] + Math.cos(la) * dx * r - Math.sin(la) * dy * r, G[1] + Math.sin(la) * dx * r + Math.cos(la) * dy * r];
  });
  return `<path d="${path(tear(pts, seed, { amp: 1, jag: 0.25, wander: 0.7 }))}" ${fill('glove')} filter="url(#dt-mitt)"/>`;
}
function arm(side, angle, { len = P.armLen } = {}) {
  const [sx, sy] = side === 'l' ? P.shoulderL : P.shoulderR;
  const a = angle * D2R;
  const ux = Math.cos(a), uy = Math.sin(a);
  const R = P.gloveR;
  const W = [sx + ux * (len - R * 0.55), sy + uy * (len - R * 0.55)];
  const G = [sx + ux * len, sy + uy * len];
  const strip = tear(stripPts([sx, sy], W, P.armW, P.armW * 0.86), side === 'l' ? 91 : 92, { amp: 0.5, jag: 0.3, wander: 0.8 });
  // a faint pencil line down the strip's lower edge: a flat strip, not a tube
  const sgn = ux >= 0 ? 1 : -1, nx = -uy, ny = ux, off = P.armW / 2 - 3.5;
  const p = t => [sx + ux * len * t + nx * sgn * off, sy + uy * len * t + ny * sgn * off];
  const side1 = pencil([p(0.25), p(0.45), p(0.62)], side === 'l' ? 31 : 32, 1, 0.3)[0];
  return `<path d="${path(strip)}" ${fill('strip')} filter="url(#dt-cut)"/>
    <path d="${side1}" fill="none" ${stroke('graphite')} stroke-width="0.9" opacity="0.18" filter="url(#dt-graphite)"/>
    ${mitten(G, a, R, side === 'l' ? 491 : 492)}
    ${brad(sx, sy)}`;
}

// ---------------------------------------------------------------- face
function eye([cx, cy], seed, { tilt = 0 } = {}) {
  const rx = P.eyeRx, ry = P.eyeRy;
  const oval = tear(ellipse(cx, cy, rx, ry, 22, tilt), seed, { amp: 0.3, jag: 0.18, wander: 0.35 });
  const ring = [...oval, oval[0], oval[1]];
  return `<path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#dt-graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.2" fill="none" opacity="0.7" filter="url(#dt-graphite)">${paths(pencil(ring, seed + 3, 2, 0.35))}</g>
    <ellipse cx="${f(cx - rx * 0.32)}" cy="${f(cy - ry * 0.36)}" rx="${f(rx * 0.34)}" ry="${f(ry * 0.28)}" ${fill('glint')} opacity="0.94"/>`;
}
function eyeShut([cx, cy], seed) {
  const rx = P.eyeRx, ry = P.eyeRy;
  const arc = [[cx - rx * 1.25, cy + 3], [cx - rx * 0.55, cy - ry * 0.42], [cx + rx * 0.55, cy - ry * 0.42], [cx + rx * 1.25, cy + 3]];
  return `<g ${stroke('graphite')} stroke-width="2.5" fill="none" stroke-linecap="round" filter="url(#dt-graphite)">${paths(pencil(arc, seed, 3, 0.4))}</g>`;
}
function mouth(kind) {
  const [mx, my] = P.mouth;
  if (kind === 'o') return `<ellipse cx="${mx}" cy="${my + 1}" rx="3.8" ry="4.8" ${fill('graphite')} opacity="0.9" filter="url(#dt-graphite-fill)"/>`;
  if (kind === 'open') {
    // a small happy open mouth: a flat top, a round bottom
    const d = `M${mx - 7.5},${my - 2} Q${mx},${my - 0.5} ${mx + 7.5},${my - 2.5} Q${mx + 6},${my + 8} ${mx},${my + 8.2} Q${mx - 6.5},${my + 8} ${mx - 7.5},${my - 2}Z`;
    return `<path d="${d}" ${fill('graphite')} opacity="0.9" filter="url(#dt-graphite-fill)"/>`;
  }
  const pts = [[mx - 7.5, my - 2.5], [mx - 3.5, my + 2], [mx + 3, my + 2], [mx + 7, my - 3]];
  return `<g ${stroke('graphite')} stroke-width="2" fill="none" stroke-linecap="round" filter="url(#dt-graphite)">${paths(pencil(pts, 17, 3, 0.35))}</g>`;
}
function cheeks(op = 0.7) {
  const hatch = ([cx, cy], seed) => {
    let d = '';
    for (let i = 0; i < 3; i++) { const x = cx - 6.5 + i * 6.5; d += paths(pencil([[x - 2.8, cy + 5], [x + 2.8, cy - 5]], seed + i, 2, 0.4)); }
    return `<g ${stroke('blush')} stroke-width="2.7" fill="none" stroke-linecap="round" filter="url(#dt-crayon)">${d}</g>`;
  };
  return `<g opacity="${op}">${hatch(P.cheekL, 501)}${hatch(P.cheekR, 511)}</g>`;
}

// ---------------------------------------------------------------- the parts, in paint order
// pose: { armL, armR (deg), legSquashL, legSquashR, deco (deg lean), blush }
export function parts(ip = 'dt-', pose = {}) {
  const o = { armL: P.armRestL, armR: P.armRestR, legSquashL: 1, legSquashR: 1, deco: 0, blush: 0.72, ...pose };
  const [hxL, hxR] = [P.cx - P.hipDX, P.cx + P.hipDX];
  return [
    { name: 'shadow', parent: 'root', pivot: [P.cx, P.ground], svg: `<ellipse cx="${P.cx}" cy="${P.ground + 1}" rx="74" ry="7.5" fill="${C.graphite}" opacity="0.1" filter="url(#dt-crayon)"/>` },
    { name: 'leg-l', parent: 'root', pivot: [hxL, P.hipY], len: P.ground - P.hipY, svg: leg(hxL, P.hipY, P.legLen, { flip: -1, seed: 5, squash: o.legSquashL }) },
    { name: 'leg-r', parent: 'root', pivot: [hxR, P.hipY], len: P.ground - P.hipY, svg: leg(hxR, P.hipY, P.legLen, { flip: 1, seed: 9, squash: o.legSquashR }) },
    { name: 'torso', parent: 'body', pivot: P.torsoPivot, svg: torso(ip) },
    { name: 'deco', parent: 'body', pivot: P.decoPivot, svg: deco(ip, { lean: o.deco }) },
    { name: 'cheeks', parent: 'face', pivot: [P.face[0], P.cheekL[1]], svg: cheeks(o.blush) },
    { name: 'eye-l', parent: 'face', pivot: P.eyeL, svg: eye(P.eyeL, 71, { tilt: -0.06 }) },
    { name: 'eye-r', parent: 'face', pivot: P.eyeR, svg: eye(P.eyeR, 72, { tilt: 0.08 }) },
    { name: 'eye-l-shut', parent: 'face', pivot: P.eyeL, variantOf: 'eye-l', svg: eyeShut(P.eyeL, 75) },
    { name: 'eye-r-shut', parent: 'face', pivot: P.eyeR, variantOf: 'eye-r', svg: eyeShut(P.eyeR, 76) },
    { name: 'mouth', parent: 'face', pivot: P.mouth, svg: mouth('smile') },
    { name: 'mouth-o', parent: 'face', pivot: P.mouth, variantOf: 'mouth', svg: mouth('o') },
    { name: 'mouth-open', parent: 'face', pivot: P.mouth, variantOf: 'mouth', svg: mouth('open') },
    { name: 'arm-l', parent: 'body', pivot: P.shoulderL, angle: o.armL, svg: arm('l', o.armL) },
    { name: 'arm-r', parent: 'body', pivot: P.shoulderR, angle: o.armR, svg: arm('r', o.armR) },
  ];
}

// A posed figure for the concept sheet, composed as the stage engine composes the rig: legs swing about the hips, the
// body (torso, curl, face, arms) tilts and squashes about the torso pivot, the face slides, variants swap in.
// pose: { tilt, squash, lift, look:[dx,dy], eyes:'open'|'shut', mouth:'mouth'|'mouth-o'|'mouth-open', legRotL, legRotR, … }
export function figure(ip, pose = {}) {
  const o = { tilt: 0, squash: 1, lift: 0, look: [0, 0], eyes: 'open', mouth: 'mouth', legRotL: 0, legRotR: 0, shadowScale: 1, ...pose };
  const ps = parts(ip, o);
  const by = Object.fromEntries(ps.map(p => [p.name, p]));
  const [tx, ty] = P.torsoPivot;
  const bodyT = `rotate(${o.tilt} ${tx} ${ty}) translate(${tx} ${ty}) scale(${1 / Math.sqrt(o.squash)} ${o.squash}) translate(${-tx} ${-ty})`;
  const legT = (p, rot) => `rotate(${rot} ${p.pivot[0]} ${p.pivot[1]})`;
  const eyes = o.eyes === 'shut' ? ['eye-l-shut', 'eye-r-shut'] : ['eye-l', 'eye-r'];
  const s = o.shadowScale;
  return `<g>
    <g transform="translate(${P.cx} ${P.ground}) scale(${s}) translate(${-P.cx} ${-P.ground})">${by.shadow.svg}</g>
    <g transform="translate(0 ${-o.lift})">
      <g transform="${legT(by['leg-l'], o.legRotL)}">${by['leg-l'].svg}</g>
      <g transform="${legT(by['leg-r'], o.legRotR)}">${by['leg-r'].svg}</g>
      <g transform="${bodyT}">
        ${by.torso.svg}
        ${by.deco.svg}
        <g transform="translate(${o.look[0]} ${o.look[1]})">
          ${by.cheeks.svg}${by[eyes[0]].svg}${by[eyes[1]].svg}${by[o.mouth].svg}
        </g>
        ${by['arm-l'].svg}
        ${by['arm-r'].svg}
      </g>
    </g>
  </g>`;
}

// 摺摺 Tuck — a torn-paper collage creature. Builds the defs and the layered character.
import { rng, spline, poly, tear, path, smoothPath, reflect, side, pencil, ellipse } from './lib.mjs';

export const C = {
  kraft: 'oklch(76% 0.05 64)',
  kraftDeep: 'oklch(66% 0.055 62)',
  backPaper: 'oklch(94% 0.025 80)',
  rule: 'oklch(72% 0.035 235)',
  tracing: 'oklch(91% 0.026 292)',
  hand: 'oklch(90% 0.035 292)',
  legA: 'oklch(82% 0.05 22)',
  legB: 'oklch(71% 0.06 20)',
  foot: 'oklch(62% 0.045 58)',
  eyeWhite: 'oklch(97.5% 0.008 85)',
  graphite: 'oklch(29% 0.018 60)',
  thread: 'oklch(60% 0.12 38)',
  blush: 'oklch(70% 0.1 24)',
  rim: 'oklch(97.5% 0.012 85)',
};

export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-300" y="-300" width="2200" height="1600"';
  return `<defs>
  <!-- torn paper: a slightly displaced edge, the white fibres the tear exposes, a glue shadow, and specks inside -->
  <filter id="c-paper" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="${C.rim}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fat" stdDeviation="3" result="blur"/><feOffset dx="2.5" dy="4.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.24"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.23  0 0 0 0 0.15  2.5 0 0 0 -1.5" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 0.98  0 0 0 0 0.93  0.42 0 0 0 -0.19" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- thin paper (tracing, eye scraps): same tear, a fainter shadow, no specks -->
  <filter id="c-thin" ${U} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="1.1" result="fat"/>
    <feGaussianBlur in="fat" stdDeviation="2" result="blur"/><feOffset dx="1.5" dy="2.5" result="off"/>
    <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.16"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.16" numOctaves="2" seed="12" result="fr"/>
    <feColorMatrix in="fr" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -0.55" result="frost"/>
    <feComposite in="frost" in2="torn" operator="in" result="frosts"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="torn"/><feMergeNode in="frosts"/></feMerge>
  </filter>
  <!-- graphite: a pencil line that skips over the tooth of the paper -->
  <filter id="c-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- crayon: soft waxy blush with gaps -->
  <filter id="c-crayon" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="13" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.9" numOctaves="2" seed="14" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.6" result="gaps"/>
    <feComposite in="d" in2="gaps" operator="in"/>
  </filter>
</defs>`;
}

const fmt = n => n.toFixed(1);

// An accordion-folded strip leg from a hip down, with a little torn foot.
function leg(id, hx, hy, len, { panels = 7, zig = 7, w = 28, lean = 0, seed = 1, flip = 1, squash = 1 } = {}) {
  const r = rng(seed);
  const ph = (len * squash) / panels;
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
    s += `<path d="${path(shape)}" fill="${i % 2 ? C.legA : C.legB}"/>`;
  }
  let lines = '';
  for (let i = 1; i < panels; i++) {
    const [a, b] = folds[i];
    lines += pencil([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.6], b], seed + i, 2, 0.5).map(d => `<path d="${d}"/>`).join('');
  }
  const end = folds[panels];
  const fx = (end[0][0] + end[1][0]) / 2 + 6 * flip, fy = end[0][1] + 6;
  const foot = tear(spline([[fx - 26, fy + 2], [fx - 10, fy - 9], [fx + 16, fy - 8], [fx + 28, fy + 3], [fx + 12, fy + 11], [fx - 16, fy + 10]], 5), seed + 50, { jag: 1, wander: 3 });
  return `<g id="${id}"><!-- pivot: ${fmt(hx)},${fmt(hy)} (hip; scaleY squeezes the accordion) -->
    <g filter="url(#c-paper)">${s}<path d="${path(foot)}" fill="${C.foot}"/></g>
    <g stroke="${C.graphite}" stroke-width="1.1" stroke-opacity="0.45" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${lines}</g>
  </g>`;
}

// A tracing-paper arm: a short, soft, club-ended scrap sewn on at the shoulder.
function arm(id, sx, sy, angleDeg, len, { seed = 1, width = 32, bend = 0 } = {}) {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const P = (t, o) => {
    const b = Math.sin(t * Math.PI * 0.9) * bend;
    return [sx + ux * len * t + nx * (o + b), sy + uy * len * t + ny * (o + b)];
  };
  const keys = [P(-0.12, -width * 0.36), P(0.3, -width * 0.4), P(0.66, -width * 0.52), P(0.94, -width * 0.42), P(1.06, -width * 0.05), P(0.98, width * 0.36), P(0.7, width * 0.5), P(0.34, width * 0.4), P(-0.12, width * 0.36)];
  const shape = tear(spline(keys, 4), seed, { jag: 0.8, wander: 2.5 });
  const knot = threadKnot(sx + ux * 4, sy + uy * 4, angleDeg, seed);
  return `<g id="${id}"><!-- pivot: ${fmt(sx)},${fmt(sy)} (shoulder, where it is sewn on) -->
    <path d="${path(shape)}" fill="${C.tracing}" fill-opacity="0.8" filter="url(#c-thin)"/>
    <path d="${path(shape)}" fill="none" stroke="${C.graphite}" stroke-width="1.1" stroke-opacity="0.32" filter="url(#c-graphite)"/>
    ${knot}
  </g>`;
}

// Two short running stitches of terracotta thread across a joint, and a loose tail.
function threadKnot(x, y, angleDeg, seed) {
  const r = rng(seed + 99);
  const a = ((angleDeg + 90) * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const st = k => {
    const cx = x + vx * k, cy = y + vy * k, j = () => (r() - 0.5) * 1.2;
    return `<path d="M${fmt(cx - ux * 7 + j())},${fmt(cy - uy * 7 + j())} L${fmt(cx + ux * 7 + j())},${fmt(cy + uy * 7 + j())}"/>`;
  };
  return `<g stroke="${C.thread}" stroke-width="2.3" stroke-linecap="round" fill="none">${st(-4.5)}${st(4.5)}
      <path d="M${fmt(x + ux * 7 + vx * 4.5)},${fmt(y + uy * 7 + vy * 4.5)} q${fmt(ux * 6 + 3)},${fmt(uy * 6 + 4)} ${fmt(ux * 4 + 1)},${fmt(uy * 4 + 10)}" stroke-width="1.4" opacity="0.8"/>
    </g>`;
}

// Cursive-looking pencil loops (not letters) for the back of the folded corner.
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

function eye(id, cx, cy, { rx = 17, ry = 19, look = [1, 1], lid = 0, seed = 1, closed = false, tilt = 0, smile = 0.6, shape = [] } = {}) {
  const base = ellipse(cx, cy, rx, ry, 24, tilt).map(([x, y], i) => [x + (shape[i % shape.length] || 0), y]);
  const scrap = tear(base, seed, { jag: 0.8, wander: 2.5 });
  const pencilG = (pts, sw, s2, op = 1) => `<g stroke="${C.graphite}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#c-graphite)">${pencil(pts, s2, 3, 0.55).map(d => `<path d="${d}"/>`).join('')}</g>`;
  if (closed) {
    // eyes shut, softly (moved / content): a downward-bowed arc and two little lashes
    const arc = [[cx - rx * 0.9, cy + 5], [cx - rx * 0.4, cy - ry * 0.3], [cx + rx * 0.4, cy - ry * 0.3], [cx + rx * 0.9, cy + 5]];
    return `<g id="${id}"><!-- pivot: ${fmt(cx)},${fmt(cy)} (closed: the eye scrap is folded away, an arc drawn on the body) -->
      ${pencilG(arc, 3.2, seed)}
    </g>`;
  }
  const pr = rx * 0.66, pry = ry * 0.7;
  const px = cx + look[0], py = cy + look[1];
  const lidY = cy - ry + ry * 2 * lid;
  const lidPts = [];
  for (let i = 0; i <= 12; i++) { const t = Math.PI + (i / 12) * Math.PI; lidPts.push([cx + Math.cos(t) * (rx + 3), cy + Math.sin(t) * (ry + 3)]); }
  const lidShape = [...lidPts, [cx + rx + 3, lidY], [cx - rx - 3, lidY + 1.5]];
  // the upper line follows the scrap's top and flicks out a little at the outer corner
  const out = cx < 390 ? -1 : 1;
  const top = lid > 0.05
    ? [[cx - rx - 2, lidY + 2], [cx - rx * 0.3, lidY - 1], [cx + rx * 0.4, lidY - 0.5], [cx + rx + 2, lidY + 1.5]]
    : [[cx - rx * 0.95, cy - ry * 0.35], [cx - rx * 0.55, cy - ry * 0.95], [cx + rx * 0.25, cy - ry * 1.08], [cx + rx * 0.9, cy - ry * 0.55]];
  const flick = out < 0 ? [top[0], [top[0][0] - 6, top[0][1] - 4]] : [top[3], [top[3][0] + 6, top[3][1] - 5]];
  const under = [[cx - rx * 0.7, cy + ry * 0.95], [cx, cy + ry * (1.05 + smile * 0.15)], [cx + rx * 0.7, cy + ry * 0.95]];
  return `<g id="${id}"><!-- pivot: ${fmt(cx)},${fmt(cy)} (blink: scaleY of the scrap + pupil) -->
    <path d="${path(scrap)}" fill="${C.eyeWhite}" filter="url(#c-thin)"/>
    <clipPath id="${id}-clip"><path d="${path(scrap)}"/></clipPath>
    <g clip-path="url(#${id}-clip)">
      <g id="${id}-pupil"><!-- pivot: ${fmt(px)},${fmt(py)} (gaze: translate ±5 inside the scrap) -->
        <ellipse cx="${fmt(px)}" cy="${fmt(py)}" rx="${fmt(pr)}" ry="${fmt(pry)}" fill="${C.graphite}" filter="url(#c-graphite)"/>
        <ellipse cx="${fmt(px - pr * 0.32)}" cy="${fmt(py - pry * 0.38)}" rx="${fmt(pr * 0.27)}" ry="${fmt(pry * 0.24)}" fill="${C.eyeWhite}"/>
        <ellipse cx="${fmt(px + pr * 0.35)}" cy="${fmt(py + pry * 0.42)}" rx="${fmt(pr * 0.1)}" ry="${fmt(pry * 0.09)}" fill="${C.eyeWhite}" opacity="0.8"/>
      </g>
      ${lid > 0.05 ? `<path d="${path(lidShape)}" fill="${C.kraft}"/>` : ''}
    </g>
    ${pencilG(top, 2.5, seed + 5)}
    ${smile > 0 ? pencilG(under, 1.4, seed + 7, 0.45) : ''}
  </g>`;
}

// The whole creature. `pose` tweaks joints and face for the thumbnails.
export function tuck(P = 'c-', pose = {}) {
  const o = {
    tilt: -4, legSquashR: 0.84, armL: -126, armR: 64, armLlen: 66, armRlen: 62, armLbend: -6, armRbend: 4, flap: 1, look: [1, 0], lid: 0,
    brow: 'up', mouth: 'smile', closed: false, legSquash: 1, legLean: [-8, 16], blush: 0.7, tear: false, smile: 0,
    wrap: 'translate(400 410) scale(1.28) translate(-404 -462)', ...pose,
  };
  const keys = [[262, 352], [290, 296], [334, 264], [420, 250], [500, 250], [552, 268], [566, 360], [556, 470], [500, 552], [404, 578], [312, 562], [258, 494], [248, 420]];
  if (o.shape === 'bean') keys.splice(0, keys.length, [276, 392], [292, 316], [340, 266], [418, 246], [494, 250], [540, 284], [556, 372], [552, 468], [516, 546], [430, 582], [338, 576], [282, 534], [264, 466]);
  if (o.shape === 'lean') keys.splice(0, keys.length, [270, 380], [282, 306], [326, 262], [398, 240], [478, 238], [532, 262], [556, 350], [560, 452], [530, 538], [446, 580], [350, 580], [288, 546], [262, 470]);
  if (o.shape === 'scrap') keys.splice(0, keys.length, [258, 338], [300, 280], [352, 256], [440, 244], [520, 246], [556, 276], [568, 392], [552, 494], [496, 562], [400, 584], [318, 570], [270, 516], [248, 430]);
  const outline = o.shape === 'scrap' ? spline(keys, 8).map((p, i, arr) => p) : spline(keys, 8);
  const body = tear(outline, 41, { jag: 1.3, wander: 11 });
  // the dog-ear: fold the top-right corner forward along the crease A–B
  const A = o.crease ? o.crease[0] : [428, 249], B = o.crease ? o.crease[1] : [566, 386];
  let iStart = 0;
  for (let i = 0; i < body.length; i++) if (side(body[i], A, B) <= 0 && side(body[(i - 1 + body.length) % body.length], A, B) > 0) iStart = i;
  const ordered = body.map((_, i) => body[(iStart + i) % body.length]);
  const corner = ordered.filter(p => side(p, A, B) <= 0);
  const keep = ordered.filter(p => side(p, A, B) > 0);
  // flap = the corner reflected over the crease; o.flap 1 = folded down (back showing), 0 = standing up
  const folded = o.flap >= 1;
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const rot = (p, deg) => { const r = (deg * Math.PI) / 180, dx = p[0] - M[0], dy = p[1] - M[1]; return [M[0] + dx * Math.cos(r) - dy * Math.sin(r), M[1] + dx * Math.sin(r) + dy * Math.cos(r)]; };
  const flapPts = folded ? [A, ...corner.map(p => reflect(p, A, B)), B] : [rot(A, -11), ...corner.map(p => rot(p, -11)), rot(B, -11)];
  const bodyD = path(folded ? keep : keep);
  const flapD = path(flapPts);

  // pencil shading along the lower right of the body (volume, not a 3D gradient)
  const hatches = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17, ang = -0.05 + t * 1.6;
    const cx = 405 + Math.cos(ang) * 152, cy = 412 + Math.sin(ang) * 170;
    hatches.push([[cx - 5, cy - 18], [cx + 6, cy + 8]]);
  }
  const hatchD = hatches.map((h, i) => pencil(h, 300 + i, 1, 0.6)[0]).map(d => `<path d="${d}"/>`).join('');

  // back of the folded corner: faint rules and a few lines of somebody's handwriting
  let back = '';
  if (folded) {
    let rules = '', ink = '';
    for (let k = 0; k < 10; k++) {
      const y = 250 + k * 17;
      rules += `<path d="M400,${y} L600,${y - 22}"/>`;
      if (k > 0 && k < 9) ink += scribbleLine(420 + (k % 3) * 6, y - 3, 150 - k * 4, 70 + k);
    }
    back = `<clipPath id="${P}flapclip"><path d="${flapD}"/></clipPath>
      <g clip-path="url(#${P}flapclip)">
        <g stroke="${C.graphite}" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round" transform="rotate(-6 500 300)">${ink}</g>
      </g>`;
  }
  // a soft shadow where the folded corner lifts off the body
  const lift = folded ? `<path d="${flapD}" fill="oklch(28% 0.03 55)" opacity="0.16" transform="translate(3 6)" filter="url(#c-crayon)"/>` : '';
  const crease = folded ? '' : `<g stroke="${C.graphite}" stroke-width="1.6" fill="none" opacity="0.55" stroke-linecap="round" filter="url(#c-graphite)">${pencil([A, M, B], 404, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;

  const brows = {
    up: [[[316, 352], [332, 343], [350, 345]], [[424, 342], [441, 337], [457, 344]]],
    worry: [[[318, 350], [334, 349], [350, 356]], [[424, 355], [440, 348], [455, 347]]],
    lift: [[[312, 340], [330, 328], [350, 332]], [[424, 330], [442, 325], [460, 334]]],
    soft: [[[316, 356], [333, 351], [350, 354]], [[424, 352], [441, 349], [457, 354]]],
  }[o.brow];
  const mouths = {
    smile: [[372, 446], [382, 455], [395, 456], [405, 449]],
    soft: [[376, 452], [388, 456], [400, 451]],
    wobble: [[373, 452], [381, 448], [389, 452], [397, 448], [404, 452]],
  };
  const mouth = o.mouth === 'o'
    ? `<ellipse cx="389" cy="452" rx="6.5" ry="8" fill="${C.graphite}" opacity="0.9" filter="url(#c-graphite)"/>`
    : `<g stroke="${C.graphite}" stroke-width="2.6" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(mouths[o.mouth], 17, 3, 0.55).map(d => `<path d="${d}"/>`).join('')}</g>`;

  const tearDrop = o.tear ? `<g id="${P}tear"><path d="M462,412 q-7,13 0,19 q7,-6 0,-19Z" fill="oklch(90% 0.035 230)" stroke="${C.graphite}" stroke-width="1.3" opacity="0.92"/></g>` : '';

  return `<g id="${P}tuck" transform="${o.wrap}"><!-- pivots below are in this group's own coordinates -->
  <g id="${P}shadow"><!-- pivot: 402,690 -->
    <ellipse cx="402" cy="690" rx="122" ry="12" fill="${C.graphite}" opacity="0.1" filter="url(#c-crayon)"/>
  </g>
  ${leg(`${P}leg-l`, 358, 552, 114, { seed: 5, lean: o.legLean[0], flip: 1, squash: o.legSquash * (o.legSquashL ?? 1) })}
  ${leg(`${P}leg-r`, 444, 556, 110, { seed: 9, lean: o.legLean[1], flip: -1, squash: o.legSquash * (o.legSquashR ?? 1) })}
  <g id="${P}body" transform="rotate(${o.tilt} 404 580)"><!-- pivot: 404,580 (sway / squash from the base) -->
    <g id="${P}tab" transform="rotate(${o.tab ?? 0} 318 270)"><!-- pivot: 318,270 (a little torn tab left over from the tear: perks up, droops, wiggles after a hop) -->
      <path d="${path(tear(poly([[300, 284], [296, 252], [292, 236], [302, 226], [314, 230], [322, 224], [330, 236], [336, 266], [340, 290]], 5), 53, { jag: 1, wander: 3 }))}" fill="${o.bodyFill || C.kraft}" filter="url(#c-paper)"/>
    </g>
    <path d="${bodyD}" fill="${o.bodyFill || C.kraft}" filter="url(#c-paper)"/>
    <clipPath id="${P}bodyclip"><path d="${bodyD}"/></clipPath>
    <g clip-path="url(#${P}bodyclip)" stroke="${C.graphite}" stroke-width="1.2" opacity="0.2" fill="none" filter="url(#c-graphite)">${hatchD}</g>
    ${o.creases === false ? '' : `<g clip-path="url(#${P}bodyclip)">
      <path d="M230,492 L600,470 L600,640 L230,640Z" fill="oklch(40% 0.04 60)" opacity="0.06"/>
      <path d="M230,492 L600,470" stroke="oklch(97% 0.015 80)" stroke-width="2" opacity="0.45" filter="url(#c-graphite)"/>
      <path d="M230,494.5 L600,472.5" stroke="oklch(40% 0.04 60)" stroke-width="1" opacity="0.14"/>
    </g>`}
    <g id="${P}flap"><!-- pivot: ${A[0]},${A[1]}; crease ${A[0]},${A[1]} → ${B[0]},${B[1]} (θ = ${fmt(Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI)}°). Unfold/refold = rotate(θ) scaleY(1 → -1) rotate(-θ) about the pivot -->
      ${lift}
      <path d="${flapD}" fill="${folded ? C.backPaper : (o.bodyFill || C.kraft)}" filter="url(#c-paper)"/>
      ${back}${crease}
    </g>
    <g id="${P}face"><!-- pivot: 388,410 (the face slides a few px to look around) -->
      <g id="${P}cheek-l" opacity="${o.blush}"><!-- pivot: 314,434 --><ellipse cx="314" cy="434" rx="21" ry="12" fill="${C.blush}" filter="url(#c-crayon)"/></g>
      <g id="${P}cheek-r" opacity="${o.blush}"><!-- pivot: 466,432 --><ellipse cx="466" cy="432" rx="20" ry="11" fill="${C.blush}" filter="url(#c-crayon)"/></g>
      ${eye(`${P}eye-l`, 334, 394, { rx: 18, ry: 20.5, look: o.look, lid: o.lid, seed: 71, closed: o.closed, tilt: -0.1, smile: o.smile, shape: [0, 1, 1.5, 0, -1, 0] })}
      ${eye(`${P}eye-r`, 440, 391, { rx: 16.5, ry: 19.5, look: o.look, lid: o.lid, seed: 72, closed: o.closed, tilt: 0.12, smile: o.smile, shape: [0.5, 0, -1, 0, 1] })}
      <g id="${P}brow-l"><!-- pivot: 333,346 --><g stroke="${C.graphite}" stroke-width="2.5" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(brows[0], 81, 2, 0.5).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}brow-r"><!-- pivot: 441,341 --><g stroke="${C.graphite}" stroke-width="2.5" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(brows[1], 82, 2, 0.5).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}mouth"><!-- pivot: 389,452 -->${mouth}</g>
      ${tearDrop}
    </g>
  </g>
  ${arm(`${P}arm-l`, 272, 456, o.armL, o.armLlen, { seed: 91, bend: o.armLbend })}
  ${arm(`${P}arm-r`, 536, 450, o.armR, o.armRlen, { seed: 92, bend: o.armRbend })}
</g>`;
}

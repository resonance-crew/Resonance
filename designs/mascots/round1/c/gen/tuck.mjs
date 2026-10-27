// 摺摺 Tuck (v2) — a torn-paper collage creature. Builds the defs and the layered character.
// v2: sage coloured paper (white on its back), pencil eyes drawn straight on the paper, brows only
// for strong feelings, pale torn-paper hands, arms inside the body, a two-faced flap with the
// writing hidden underneath it, and feet that are their own parts.
import { rng, spline, poly, tear, path, smoothPath, reflect, side, pencil, ellipse } from './lib.mjs';

// Every paper colour is a custom property with its day value as the fallback (`--c-body`, …),
// so a theme (sage / lavender / yellow) or a night override can recolour the sheets without
// regenerating. The fibre rim, glue shadow and specks live in the filters and stay as they are.
export const C = {
  body: 'oklch(80% 0.044 140)',      // sage coloured paper, front
  bodyDeep: 'oklch(68% 0.045 142)',    // the same sheet's offcut (feet)
  back: 'oklch(94.5% 0.02 86)',       // the white side of the coloured paper (flap's back)
  hand: 'oklch(89% 0.032 32)',       // pale rose scrap
  legA: 'oklch(82% 0.05 22)',
  legB: 'oklch(71% 0.06 20)',
  graphite: 'oklch(29% 0.018 60)',
  glint: 'oklch(97% 0.01 85)',
  blush: 'oklch(74% 0.1 16)',
  rim: 'oklch(97.5% 0.012 85)',
};
const VAR = { body: 'body', bodyDeep: 'foot', back: 'flap-back', hand: 'hand', legA: 'leg', legB: 'leg-fold', graphite: 'ink', blush: 'blush', glint: 'glint' };
const fill = k => `style="fill:var(--c-${VAR[k]}, ${C[k]})"`;
const stroke = k => `style="stroke:var(--c-${VAR[k]}, ${C[k]})"`;

export function defs() {
  const U = 'filterUnits="userSpaceOnUse" x="-300" y="-300" width="2200" height="1600"';
  return `<defs>
  <!-- torn paper: a slightly displaced edge, the white fibres the tear exposes, a glue shadow, a few fibre specks inside -->
  <filter id="c-paper" ${U} color-interpolation-filters="sRGB">
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
  <filter id="c-thin" ${U} color-interpolation-filters="sRGB">
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
  <filter id="c-graphite" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- graphite fill: a pencil-filled shape, denser than a line, still a little grainy at the edge -->
  <filter id="c-graphite-fill" ${U}>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="21" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.8" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="22" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.75" result="tooth"/>
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
export let HAND = 'petal', TAB = 'lean', TABFILL = 'body';
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
    <g filter="url(#c-paper)">${s}</g>
    <g ${stroke('graphite')} stroke-width="1.1" stroke-opacity="0.45" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${lines}</g>
  </g>`;
  const footSvg = `<g id="${footId}"${footT}><!-- pivot: ${fmt(sole[0])},${fmt(sole[1])} (sole centre). Never scaled. Follows its leg: translate(0, (legScaleY − 1) × ${len}); if the leg rotates, it rides the leg's bottom end ${fmt(bx)},${fmt(by)} and may tilt ±10° about this pivot to plant flat -->
    <path d="${path(foot)}" ${fill('bodyDeep')} filter="url(#c-paper)"/>
  </g>`;
  return { legSvg, footSvg };
}

// A hand: a small pale scrap torn off another sheet, glued on at the shoulder. Tapered like a torn
// petal, no lines across it (so it never reads as a bandage, a glove or a sock).
function arm(id, sx, sy, angleDeg, len, { seed = 1, width = 30, bend = 0, shape: kind = HAND } = {}) {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const P = (t, o) => {
    const b = Math.sin(t * Math.PI * 0.9) * bend;
    return [sx + ux * len * t + nx * (o + b), sy + uy * len * t + ny * (o + b)];
  };
  const shapes = {
    // a strip torn across at a slant: two straight-ish runs and a ragged end
    strip: () => tear(poly([P(-0.14, -width * 0.3), P(0.55, -width * 0.42), P(0.98, -width * 0.44), P(1.04, width * 0.06), P(0.9, width * 0.42), P(0.4, width * 0.4), P(-0.14, width * 0.3)], 3.5), seed, { jag: 1.2, wander: 3 }),
    // a torn petal: broad in the middle, a ragged narrow tip
    petal: () => tear(poly([P(-0.14, -width * 0.28), P(0.4, -width * 0.48), P(0.8, -width * 0.3), P(1.06, -width * 0.04), P(0.84, width * 0.3), P(0.42, width * 0.46), P(-0.14, width * 0.28)], 3.5), seed, { jag: 1.2, wander: 3 }),
    // a mitten scrap: the old rounded one
    round: () => tear(spline([P(-0.14, -width * 0.26), P(0.25, -width * 0.36), P(0.6, -width * 0.5), P(0.86, -width * 0.38), P(1.04, -width * 0.02), P(0.93, width * 0.3), P(0.62, width * 0.44), P(0.3, width * 0.36), P(-0.14, width * 0.26)], 4), seed, { jag: 1, wander: 3 }),
  };
  const shape = shapes[kind]();
  return `<g id="${id}"><!-- pivot: ${fmt(sx)},${fmt(sy)} (shoulder, where the scrap is glued on) -->
    <path d="${path(shape)}" ${fill('hand')} filter="url(#c-thin)"/>
  </g>`;
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
  const pencilG = (pts, sw, s2, op = 1) => `<g ${stroke('graphite')} stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${op}" filter="url(#c-graphite)">${pencil(pts, s2, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;
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
    <path d="${smoothPath(oval, true)}" ${fill('graphite')} filter="url(#c-graphite-fill)"/>
    <g ${stroke('graphite')} stroke-width="1.5" fill="none" opacity="0.7" filter="url(#c-graphite)">${pencil(ring, seed + 3, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g>
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
};
export function tuck(P = 'c-', pose = {}) {
  const o = {
    tilt: -4, legSquashR: 0.84, armL: -126, armR: 64, armLlen: 60, armRlen: 56, armLbend: -5, armRbend: 4, flapS: 1, flapTilt: 0, look: [1, 0],
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
        <g ${stroke('graphite')} stroke-width="1.2" fill="none" opacity="0.6" stroke-linecap="round" filter="url(#c-graphite)" transform="rotate(-3 500 320)">${ink}</g>
      </g></g>
    </g>`;
  const lift = `<path d="${flapD}" fill="oklch(28% 0.03 55)" opacity="${showBack ? 0.22 : 0}" transform="translate(3 6)" filter="url(#c-crayon)"/>`;
  const creaseLine = `<g ${stroke('graphite')} stroke-width="1.6" fill="none" opacity="${s === 1 ? 0.38 : 0.45}" stroke-linecap="round" filter="url(#c-graphite)">${pencil([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], B], 404, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;

  const brows = {
    lift: [[[322, 362], [338, 354], [354, 357]], [[418, 357], [433, 352], [448, 357]]],
    worry: [[[324, 360], [338, 360], [352, 366]], [[418, 365], [432, 359], [446, 358]]],
  }[o.brow];
  const mouths = {
    smile: [[377, 440], [384, 446], [393, 446], [399, 440]],
    soft: [[379, 444], [388, 447], [397, 443]],
  };
  const mouth = o.mouth === 'o'
    ? `<ellipse cx="388" cy="444" rx="5" ry="6.2" ${fill('graphite')} opacity="0.9" filter="url(#c-graphite-fill)"/>`
    : `<g ${stroke('graphite')} stroke-width="2.3" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(mouths[o.mouth], 17, 3, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;

  const tearDrop = o.tear ? `<g id="${P}tear"><path d="M447,410 q-6,11 0,16 q6,-5 0,-16Z" fill="oklch(92% 0.03 230)" stroke="${C.graphite}" stroke-width="1.2" opacity="0.92"/></g>` : '';

  const legL = leg(`${P}leg-l`, `${P}foot-l`, 358, 552, 114, { seed: 5, lean: o.legLean[0], flip: 1, squash: o.legSquash * (o.legSquashL ?? 1), footTilt: o.footTiltL || 0 });
  const legR = leg(`${P}leg-r`, `${P}foot-r`, 444, 556, 110, { seed: 9, lean: o.legLean[1], flip: -1, squash: o.legSquash * (o.legSquashR ?? 1), footTilt: o.footTiltR || 0 });
  const arms = `${arm(`${P}arm-l`, 274, 452, o.armL, o.armLlen, { seed: 91, bend: o.armLbend })}
    ${arm(`${P}arm-r`, 534, 448, o.armR, o.armRlen, { seed: 92, bend: o.armRbend })}`;
  const bodyT = `rotate(${o.tilt} 404 580)${o.bodyScaleY !== 1 ? ` translate(404 580) scale(1 ${o.bodyScaleY}) translate(-404 -580)` : ''}`;

  return `<g id="${P}tuck" transform="${o.wrap}"><!-- pivots below are in this group's own coordinates -->
  <g id="${P}shadow"><!-- pivot: 402,690 -->
    <ellipse cx="402" cy="690" rx="122" ry="12" fill="${C.graphite}" opacity="0.1" filter="url(#c-crayon)"/>
  </g>
  ${legL.legSvg}
  ${legR.legSvg}
  ${legL.footSvg}
  ${legR.footSvg}
  <g id="${P}body" transform="${bodyT}"><!-- pivot: 404,580 (sway ±6°, breathe scaleY 1 → 0.985, squash on landing). Everything inside rides with it: tab, flap, face and both arms; legs and feet stay outside -->
    ${o.armsBehind ? arms : ''}
    <g id="${P}tab" transform="rotate(${o.tab ?? 0} 318 292)"><!-- pivot: 318,292 (root of the little torn tab left over from the tear: perks up, droops, wiggles after a hop) -->
      <path d="${path(tear(poly(TABS[TAB], 5), 53, { jag: 1.3, wander: 4 }))}" ${fill(TABFILL)} filter="url(#c-paper)"/>
    </g>
    <g id="${P}sheet"><!-- the body paper itself; no pivot of its own -->
      <path d="${bodyD}" ${fill('body')} filter="url(#c-paper)"/>
      <clipPath id="${P}bodyclip"><path d="${bodyD}"/></clipPath>
      <g clip-path="url(#${P}bodyclip)" ${stroke('graphite')} stroke-width="1.2" opacity="0.17" fill="none" filter="url(#c-graphite)">${hatchD}</g>
      <g clip-path="url(#${P}bodyclip)">
        <path d="M230,492 L600,470 L600,640 L230,640Z" fill="oklch(40% 0.04 140)" opacity="0.05"/>
        <path d="M230,492 L600,470" stroke="oklch(97% 0.015 100)" stroke-width="2" opacity="0.5" filter="url(#c-graphite)"/>
        <path d="M230,494.5 L600,472.5" stroke="oklch(40% 0.04 140)" stroke-width="1" opacity="0.13"/>
      </g>
    </g>
    ${note}
    <g id="${P}flap"${flapT}><!-- pivot: ${A[0]},${A[1]}; crease ${A[0]},${A[1]} to ${B[0]},${B[1]} (θ = ${fmt(theta)}°). Drawn folded. Open / close = translate(${A[0]} ${A[1]}) rotate(θ) scale(1, s) rotate(−θ) translate(${-A[0]} ${-A[1]}), s from 1 (folded) through 0 (on edge) to −1 (laid open). While s > 0 show c-flap-back; once s crosses 0 hide it and show c-flap-front -->
      ${lift}
      <g id="${P}flap-back"${showBack ? '' : ' visibility="hidden"'}><!-- the white side of the coloured paper -->
        <path d="${flapD}" ${fill('back')} filter="url(#c-paper)"/>
      </g>
      <g id="${P}flap-front"${showBack ? ' visibility="hidden"' : ''}><!-- the coloured side; seen once the corner is opened past its edge -->
        <path d="${flapD}" ${fill('body')} filter="url(#c-paper)"/>
      </g>
    </g>
    ${creaseLine}
    <g id="${P}face"><!-- pivot: 388,410 (the face slides ±6 to look around) -->
      <g id="${P}cheek-l" opacity="${o.blush}"><!-- pivot: 320,428 --><ellipse cx="320" cy="428" rx="17" ry="10" ${fill('blush')} filter="url(#c-crayon)"/></g>
      <g id="${P}cheek-r" opacity="${o.blush}"><!-- pivot: 456,426 --><ellipse cx="456" cy="426" rx="16" ry="9.5" ${fill('blush')} filter="url(#c-crayon)"/></g>
      ${eye(`${P}eye-l`, 340, 396, { rx: 10.5, ry: 13.5, look: o.look, seed: 71, closed: o.closed, tilt: -0.08 })}
      ${eye(`${P}eye-r`, 433, 394, { rx: 9.8, ry: 12.8, look: o.look, seed: 72, closed: o.closed, tilt: 0.1 })}
      <g id="${P}brow-l" opacity="${o.browOpacity}"><!-- pivot: 338,358. Hidden at rest (opacity 0): brows come in only for strong feelings (surprise, being moved, worry) -->
        <g ${stroke('graphite')} stroke-width="1.8" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(brows[0], 81, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}brow-r" opacity="${o.browOpacity}"><!-- pivot: 433,356. Hidden at rest, as brow-l -->
        <g ${stroke('graphite')} stroke-width="1.8" fill="none" stroke-linecap="round" filter="url(#c-graphite)">${pencil(brows[1], 82, 2, 0.45).map(d => `<path d="${d}"/>`).join('')}</g></g>
      <g id="${P}mouth"><!-- pivot: 388,444 -->${mouth}</g>
      ${tearDrop}
    </g>
    ${o.armsBehind ? '' : arms}
  </g>
</g>`;
}

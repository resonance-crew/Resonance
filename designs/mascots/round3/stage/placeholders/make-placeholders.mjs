// Three stand-in rigs for the stage while the real cast is being drawn (kit.md "Rig contract"):
//   tall  — slim and tall (1.35×), long legs, short arms, a bow on a string, pin-prick stars (+ a glow on dark)
//   pip   — small (0.55×), round, tiny limbs, a quilled curl, moves by hopping (data-walk="hop")
//   sheet — Tuck-sized (1.0×), a tuft of torn paper, cheeks, a dog-ear that opens (torso-alt), an open mouth
// They are deliberately plain: grey-ish papers, simple shapes, the shared grammar (brads inside the edge, cream
// mittens, two oval eyes). Run: node make-placeholders.mjs   (writes <name>/rig.svg and exports <name>/parts)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORTER = join(HERE, '../../kit/export-parts.mjs');

const INK = 'oklch(29% 0.018 60)', GLINT = 'oklch(97% 0.01 85)', GLOVE = 'oklch(93% 0.026 86)';
const BRASS = 'oklch(73% 0.085 82)', BRASS_RIM = 'oklch(50% 0.06 68)', BLUSH = 'oklch(62% 0.14 45)';

const filters = p => `<defs>
 <filter id="${p}paper" filterUnits="userSpaceOnUse" x="-40" y="-40" width="780" height="840" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="2" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="torn"/>
  <feMorphology in="torn" operator="dilate" radius="1.7" result="fat"/>
  <feFlood flood-color="oklch(97.5% 0.012 85)"/><feComposite in2="fat" operator="in" result="rim"/>
  <feGaussianBlur in="fat" stdDeviation="3"/><feOffset dx="2.5" dy="4.5" result="off"/>
  <feFlood flood-color="oklch(28% 0.03 55)" flood-opacity="0.22"/><feComposite in2="off" operator="in" result="shadow"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="5" result="m"/>
  <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.36 0 0 0 -0.15" result="mottle"/>
  <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
  <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
 </filter>
 <filter id="${p}soft" filterUnits="userSpaceOnUse" x="-40" y="-40" width="780" height="840"><feGaussianBlur stdDeviation="5"/></filter>
 <filter id="${p}glow" filterUnits="userSpaceOnUse" x="-40" y="-40" width="780" height="840"><feGaussianBlur stdDeviation="7"/></filter>
</defs>`;

// one arm: a strip from the brad at `deg` (0 = right, 90 = down) for `len`, a mitten with a thumb, the brad on top
function arm(p, side, [bx, by], deg, len, colour) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, w = 11;
  const mx = bx + ux * len, my = by + uy * len;
  const q = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const strip = `M${q(bx + nx * w, by + ny * w)} L${q(mx + nx * w * 0.9, my + ny * w * 0.9)} L${q(mx - nx * w * 0.9, my - ny * w * 0.9)} L${q(bx - nx * w, by - ny * w)} Z`;
  const k = side === 'l' ? -15 : 15;   // the thumb points toward the body
  const tx = mx + nx * k - ux * 4, ty = my + ny * k - uy * 4;
  return `<g data-part="arm-${side}" data-parent="body" data-pivot="${bx} ${by}" data-angle="${deg}">
  <path d="${strip}" fill="${colour}" filter="url(#${p}paper)"/>
  <g filter="url(#${p}paper)"><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="8" fill="${GLOVE}"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="19" fill="${GLOVE}"/></g>
  <circle cx="${bx}" cy="${by}" r="8" fill="${BRASS}" stroke="${BRASS_RIM}" stroke-width="2"/><circle cx="${bx - 2.5}" cy="${by - 2.5}" r="2.2" fill="oklch(94% 0.035 92)"/>
 </g>`;
}

function leg(p, side, [hx, hy], len, colour, sole) {
  return `<g data-part="leg-${side}" data-parent="root" data-pivot="${hx} ${hy}" data-len="${len}">
  <path d="M${hx - 10} ${hy - 6} L${hx + 10} ${hy - 6} L${hx + 9} ${hy + len - 8} L${hx - 9} ${hy + len - 8} Z" fill="${colour}" filter="url(#${p}paper)"/>
  <ellipse cx="${hx + (side === 'l' ? -4 : 4)}" cy="${hy + len - 6}" rx="19" ry="7.5" fill="${sole}" filter="url(#${p}paper)"/>
 </g>`;
}

function face(p, [lx, ly], [rx, ry], [mx, my], { er = 1, cheeks = false, open = false } = {}) {
  const eye = (side, x, y) => `<g data-part="eye-${side}" data-parent="face" data-pivot="${x} ${y}"><ellipse cx="${x}" cy="${y}" rx="${8 * er}" ry="${11 * er}" fill="${INK}"/><circle cx="${x + 2.4 * er}" cy="${y - 3.6 * er}" r="${2.6 * er}" fill="${GLINT}"/></g>`;
  const shut = (side, x, y) => `<g data-part="eye-${side}-shut" data-parent="face" data-pivot="${x} ${y}" data-variant-of="eye-${side}"><path d="M${x - 10 * er} ${y + 3} q${10 * er} ${-11 * er} ${20 * er} 0" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" fill="none"/></g>`;
  return [
    cheeks ? `<g data-part="cheeks" data-parent="face" data-pivot="${mx} ${my}"><g fill="${BLUSH}" opacity="0.4" filter="url(#${p}soft)"><ellipse cx="${lx - 12}" cy="${my - 4}" rx="13" ry="7"/><ellipse cx="${rx + 12}" cy="${my - 4}" rx="13" ry="7"/></g></g>` : '',
    eye('l', lx, ly), eye('r', rx, ry), shut('l', lx, ly), shut('r', rx, ry),
    `<g data-part="mouth" data-parent="face" data-pivot="${mx} ${my}"><path d="M${mx - 9} ${my - 3} q9 8 18 0" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"/></g>`,
    `<g data-part="mouth-o" data-parent="face" data-pivot="${mx} ${my}" data-variant-of="mouth"><ellipse cx="${mx}" cy="${my}" rx="5.5" ry="6.5" fill="${INK}"/></g>`,
    open ? `<g data-part="mouth-open" data-parent="face" data-pivot="${mx} ${my}" data-variant-of="mouth"><path d="M${mx - 11} ${my - 4} q11 16 22 0 z" fill="${INK}"/></g>` : '',
  ].join('\n ');
}

const svg = (attrs, body, p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 760">
${filters(p)}
<g data-rig ${attrs}>
 <g data-part="shadow" data-parent="root" data-pivot="350 700"><ellipse cx="350" cy="702" rx="WRX" ry="11" fill="oklch(28% 0.03 55)" opacity="0.2" filter="url(#${p}soft)"/></g>
 ${body}
</g></svg>`;

const rigs = {
  tall: () => {
    const p = 'ph1-', paper = 'oklch(76% 0.032 238)', deep = 'oklch(62% 0.04 240)';
    const torso = 'M268 160 Q350 118 432 160 L440 520 Q440 548 412 548 L288 548 Q260 548 260 520 Z';
    return svg('data-name="替身 A（高）" data-prefix="ph1-" data-ground="350 700" data-face-center="350 300" data-height="567" data-walk="walk"', [
      leg('ph1-', 'l', [324, 540], 160, deep, 'oklch(52% 0.04 240)'), leg('ph1-', 'r', [376, 540], 160, deep, 'oklch(52% 0.04 240)'),
      `<g data-part="deco-back" data-parent="body" data-pivot="350 160"><path d="M346 168 C 318 118, 330 92, 350 92 C 370 92, 382 118, 354 168" stroke="oklch(70% 0.03 70)" stroke-width="4" fill="none" stroke-linecap="round"/></g>`,
      `<g data-part="torso" data-parent="body" data-pivot="350 548"><path d="${torso}" fill="${paper}" filter="url(#ph1-paper)"/><circle cx="350" cy="168" r="9" fill="none" stroke="oklch(66% 0.03 238)" stroke-width="4"/></g>`,
      `<g data-part="stars-glow" data-parent="body" data-pivot="350 460" data-only="dark"><g fill="oklch(92% 0.08 95)" opacity="0.75" filter="url(#ph1-glow)"><circle cx="300" cy="440" r="8"/><circle cx="392" cy="470" r="7"/><circle cx="330" cy="500" r="7"/><circle cx="405" cy="420" r="6"/></g></g>`,
      `<g data-part="stars" data-parent="body" data-pivot="350 460"><g fill="oklch(97% 0.03 95)"><circle cx="300" cy="440" r="3.2"/><circle cx="392" cy="470" r="2.8"/><circle cx="330" cy="500" r="2.6"/><circle cx="405" cy="420" r="2.4"/></g></g>`,
      `<g data-part="deco" data-parent="body" data-pivot="350 150"><g filter="url(#ph1-paper)" fill="oklch(70% 0.09 30)"><path d="M350 146 C 320 120, 302 132, 306 150 C 310 168, 332 160, 350 150 Z"/><path d="M350 146 C 380 120, 398 132, 394 150 C 390 168, 368 160, 350 150 Z"/><circle cx="350" cy="149" r="9"/></g></g>`,
      face('ph1-', [322, 292], [378, 292], [350, 328]),
      arm('ph1-', 'l', [283, 400], 100, 78, deep), arm('ph1-', 'r', [417, 400], 80, 78, deep),
    ].join('\n '), 'ph1-').replace('WRX', '96');
  },
  pip: () => {
    const p = 'ph2-', paper = 'oklch(86% 0.045 165)', deep = 'oklch(70% 0.05 165)';
    return svg('data-name="替身 B（跳）" data-prefix="ph2-" data-ground="350 700" data-face-center="350 556" data-height="234" data-walk="hop"', [
      leg('ph2-', 'l', [330, 652], 46, deep, 'oklch(58% 0.05 165)'), leg('ph2-', 'r', [370, 652], 46, deep, 'oklch(58% 0.05 165)'),
      `<g data-part="torso" data-parent="body" data-pivot="350 662"><circle cx="350" cy="564" r="100" fill="${paper}" filter="url(#ph2-paper)"/><path d="M285 610 q30 -6 60 -2 M300 628 q30 -4 50 0" stroke="oklch(72% 0.03 240)" stroke-width="2" fill="none"/></g>`,
      `<g data-part="deco" data-parent="body" data-pivot="350 470"><path d="M350 470 C 350 440, 382 432, 388 452 C 394 470, 368 478, 362 462 C 357 450, 372 446, 374 456" stroke="oklch(80% 0.08 60)" stroke-width="8" fill="none" stroke-linecap="round" filter="url(#ph2-paper)"/></g>`,
      face('ph2-', [323, 548], [377, 548], [350, 576], { er: 0.85 }),
      arm('ph2-', 'l', [271, 604], 105, 52, deep), arm('ph2-', 'r', [429, 604], 75, 52, deep),
    ].join('\n '), 'ph2-').replace('WRX', '70');
  },
  sheet: () => {
    const p = 'ph3-', paper = 'oklch(82% 0.014 250)', deep = 'oklch(66% 0.02 250)';
    const torso = 'M214 300 Q216 282 236 282 L478 284 Q496 286 496 304 L494 584 Q492 602 474 602 L226 602 Q206 600 206 582 Z';
    const cut = 'M214 300 Q216 282 236 282 L428 283 L496 352 L494 584 Q492 602 474 602 L226 602 Q206 600 206 582 Z';
    return svg('data-name="替身 C（摺摺大小）" data-prefix="ph3-" data-ground="350 700" data-face-center="350 420" data-height="418" data-walk="walk"', [
      leg('ph3-', 'l', [312, 594], 106, 'oklch(78% 0.05 85)', deep), leg('ph3-', 'r', [388, 594], 106, 'oklch(78% 0.05 85)', deep),
      `<g data-part="torso" data-parent="body" data-pivot="350 602"><path d="${torso}" fill="${paper}" filter="url(#ph3-paper)"/></g>`,
      `<g data-part="torso-alt" data-parent="body" data-pivot="350 602" data-variant-of="torso"><path d="${cut}" fill="${paper}" filter="url(#ph3-paper)"/><path d="M428 283 L496 352 L430 350 Z" fill="oklch(94.5% 0.02 86)" filter="url(#ph3-paper)"/><path d="M440 318 l22 1 M440 330 l34 1" stroke="${INK}" stroke-width="2" opacity="0.6"/></g>`,
      `<g data-part="deco" data-parent="body" data-pivot="330 286"><g fill="oklch(70% 0.03 250)" filter="url(#ph3-paper)"><path d="M300 288 C 296 262, 310 246, 318 252 C 316 266, 318 278, 322 288 Z"/><path d="M318 288 C 322 252, 340 238, 348 246 C 340 262, 338 276, 340 288 Z"/><path d="M336 288 C 346 260, 366 254, 370 262 C 360 270, 354 280, 354 288 Z"/></g></g>`,
      face('ph3-', [318, 410], [382, 410], [350, 444], { cheeks: true, open: true }),
      arm('ph3-', 'l', [236, 484], 100, 100, deep), arm('ph3-', 'r', [464, 484], 80, 100, deep),
    ].join('\n '), 'ph3-').replace('WRX', '112');
  },
};

for (const [name, make] of Object.entries(rigs)) {
  const dir = join(HERE, name); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rig.svg'), make());
  const out = execFileSync('node', [EXPORTER, join(dir, 'rig.svg'), join(dir, 'parts'), '--scale', '0.8']).toString();
  console.log(name, out.trim().replace(/\s+/g, ' '));
}

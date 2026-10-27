import { writeFileSync } from 'node:fs';
import { defs, tuck, C } from './tuck.mjs';
import { tear, spline, poly, path, pencil } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;

const extraDefs = `<defs>
  <filter id="c-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="c-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <clipPath id="c-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="c-clip-peek"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="c-clip-moved"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
</defs>`;

// main illustration: the creature, big, on cream with a faint pencil ground and one fallen scrap
const main = `<g transform="translate(500 545) scale(1.5) translate(-404 -470)">${tuck('c-', { wrap: '' })}</g>`;
const ground = pencil([[150, 892], [330, 889], [520, 893], [700, 888], [860, 892]], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
const scrap = tear(spline([[760, 872], [800, 858], [828, 870], [818, 886], [776, 890]], 5), 77, { jag: 0.9, wander: 3 });

// curious peek: leaning out from behind a torn sheet, its corner opened half way (the hidden lines show), the tab up
const wall = tear(poly([[1010, 580], [1118, 580], [1106, 650], [1124, 720], [1100, 800], [1116, 880], [1104, 970], [1010, 970]], 7), 88, { jag: 1.4, wander: 9 });
const peek = `<g clip-path="url(#c-clip-peek)">
  <rect x="1030" y="592" width="262" height="360" fill="${CREAM}"/>
  <g transform="translate(1170 822) scale(0.56) translate(-404 -580)">${tuck('c-peek-', { wrap: '', legSquashR: 1, tilt: 13, flapS: -0.55, look: [4, -2], mouth: 'o', blush: 0.4, armL: 175, armR: 40, legLean: [-2, 14], tab: -16 })}</g>
  <path d="${path(wall)}" fill="oklch(87% 0.05 88)" filter="url(#c-paper)"/>
</g>`;
// moved: eyes shut, hands to its chest, knees a little soft, one small tear; the brows come in only now
const moved = `<g clip-path="url(#c-clip-moved)">
  <rect x="1308" y="592" width="262" height="360" fill="${CREAM}"/>
  <g transform="translate(1439 826) scale(0.56) translate(-404 -580)">${tuck('c-moved-', { wrap: '', legSquashR: 1, tilt: 2, closed: true, brow: 'worry', browOpacity: 0.85, mouth: 'soft', tear: true, blush: 0.95, armL: 22, armR: 160, armLlen: 62, armRlen: 58, armLbend: 6, armRbend: -6, legSquash: 0.86, legLean: [4, -4], tab: 22 })}</g>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#c-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, '摺摺 Tuck', 34, INK, 'font-weight="600"')}
${label(58, 106, '一張被撕下來的色紙。它一直折著一個角，因為折角底下藏著幾行字。', 16)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
<path d="${path(scrap)}" fill="${C.body}" filter="url(#c-paper)"/>
${main}
${label(56, 960, '方向 C ｜撕紙拼貼紙偶 · 主姿勢「嗨」 · 修訂第二版', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
<g transform="translate(1060 96)"><g transform="scale(${96 / 520}) translate(-180 -200)"><use href="#c-tuck"/></g></g>
${label(1074, 214, '96 px', 13)}
<g transform="translate(1196 144)"><g transform="scale(${48 / 520}) translate(-180 -200)"><use href="#c-tuck"/></g></g>
${label(1200, 214, '48 px', 13)}
<g transform="translate(1290 144)"><g transform="scale(${48 / 520}) translate(-180 -200)"><use href="#c-tuck"/></g></g>
<g transform="translate(1340 156)"><g transform="scale(${32 / 520}) translate(-180 -200)"><use href="#c-tuck"/></g></g>
${label(1290, 214, '48 / 32 px', 13)}
<g transform="translate(1440 112)"><g transform="scale(${80 / 520}) translate(-180 -200)"><use href="#c-tuck" style="filter: brightness(0) opacity(0.82)"/></g></g>
${label(1426, 214, '剪影', 13)}
${label(1030, 250, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
<g clip-path="url(#c-clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#c-bggrain-night)" opacity="0.35"/>
  <g transform="translate(1300 520) scale(0.5) translate(-404 -690)"><use href="#c-tuck"/></g>
</g>
${label(1030, 580, 'c ｜好奇探頭', 15, INK)}${label(1308, 580, '被感動', 15, INK)}
${peek}${moved}
${label(1032, 952, '折角掀開一半，底下的字露出來', 12, MUTED)}${label(1310, 952, '眼睛瞇起，手按胸口；眉毛這時才出現', 12, MUTED)}
</svg>`;
writeFileSync('../concept.svg', svg);

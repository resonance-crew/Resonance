// The concept sheet (1600 × 1000), laid out like round 2's: the character large on the left in its main pose, on the right
// a) scale tests, b) the night paper, c) one landing-page activity and one emotion. Same parts and numbers as rig.svg.
import { G, C, defs, armGlove } from './card.mjs';
import { figure, NAME } from './figure.mjs';
import { tear, spline, poly, path, pencil } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK) => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round" filter="url(#cd-graphite)">${pencil(pts, seed, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;

// the poses
export const MAIN = { armL: 152, armR: -72, deco: { rot: -6, dx: 0, dy: 0 }, tilt: -1.5, mouth: 'open', blush: 0.8, legL: 3, legR: -2 };
const WAVE = { armL: -122, armR: 62, mouth: 'open', tilt: 1.5, face: [-3, 0], blush: 0.7 };
const READ = { armL: 104, armR: 76, face: [4, 7], look: [0, 2.5], mouth: 'o', shadow: false, legL: 24, legR: -10, squashL: 0.9, tilt: 0 };
const MOVED = { alt: true, eyes: 'shut', mouth: 'soft', blush: 1, armL: 32, armR: 148, tilt: 2, deco: { rot: 5, dx: 3, dy: 3 }, legL: -3, legR: 3, face: [0, 2] };

const extraDefs = `<defs>
  <filter id="cd-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="cd-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="cd-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
  <clipPath id="cd-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="cd-clip-read"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="cd-clip-moved"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
  <g id="cd-rest">${figure('rest-', {})}</g>
</defs>`;

// figure bounds at rest: beret top ≈ 285, sole 701 → about 416 tall; centre x 350
const REST_TOP = 285, REST_H = 416;
const placeCopy = (cx, bottom, h, sil = false) => { const s = h / REST_H; return `<g transform="translate(${cx} ${bottom}) scale(${s}) translate(-350 -701)"><use href="#cd-rest"${sil ? ' filter="url(#cd-sil)"' : ''}/></g>`; };

// ===== main illustration: tipping its beret with the right mitten, the left arm open
const MS = 1.5, MX = 515, MY = 905; // rig (350, 700) → (MX, MY)
const toMain = (x, y) => [MX + (x - 350) * MS, MY + (y - 700) * MS];
const main = `<g transform="translate(${MX} ${MY}) scale(${MS}) translate(-350 -700)">${figure('main-', MAIN)}</g>`;
const ground = pencil([toMain(60, 703), toMain(250, 701), toMain(450, 704), toMain(660, 700)], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
// a few pencil marks over the lifted brim: a hat being tipped
const tipMarks = [
  [toMain(588, 330), toMain(606, 314)],
  [toMain(604, 360), toMain(628, 354)],
  [toMain(560, 300), toMain(566, 278)],
].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

// ===== b: night paper — waving with the left mitten
const night = `<g clip-path="url(#cd-clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#cd-bggrain-night)" opacity="0.35"/>
  <g transform="translate(1300 512) scale(0.52) translate(-350 -701)">${figure('night-', WAVE)}</g>
</g>`;

// ===== c1: on the landing page — sitting on a story card's top edge, legs over its cover, reading its title
const RS = 0.4, RX = 1161, LEDGE = 790; // ledge top in sheet px
const ledgeTopRig = 627; // the rig y that sits on the ledge's top edge
const storyCard = (() => {
  const x0 = 1048, x1 = 1274, y0 = LEDGE, y1 = 950;
  const card = tear(poly([[x0, y0], [x1, y0 + 1], [x1 + 1, y1], [x0 - 1, y1]], 6), 870, { amp: 0.4, jag: 0.3, wander: 1 });
  const cover = tear(poly([[x0 + 10, y0 + 10], [x1 - 10, y0 + 10], [x1 - 10, y0 + 78], [x0 + 10, y0 + 78]], 6), 871, { amp: 0.4, jag: 0.4, wander: 1.2 });
  const title = pen([[x0 + 16, y0 + 100], [x0 + 80, y0 + 99], [x0 + 150, y0 + 101]], 872, 3.2, 0.55);
  const t2 = pen([[x0 + 16, y0 + 118], [x0 + 110, y0 + 118]], 873, 1.6, 0.3);
  return `<path d="${path(card)}" fill="oklch(98.5% 0.008 85)" filter="url(#cd-card)"/>
    <path d="${path(cover)}" fill="oklch(84% 0.045 145)" opacity="0.9" filter="url(#cd-thin)"/>${title}${t2}`;
})();
const read = `<g clip-path="url(#cd-clip-read)">
  <rect x="1030" y="592" width="262" height="360" fill="${CREAM}"/>
  ${storyCard}
  <g transform="translate(${RX} ${LEDGE}) scale(${RS}) translate(-350 ${-ledgeTopRig})">${figure('read-', READ)}</g>
</g>`;

// ===== c2: moved by a story — the card fills with writing, eyes shut, arms round itself, the beret slipping
const moved = `<g clip-path="url(#cd-clip-moved)">
  <rect x="1308" y="592" width="262" height="360" fill="${CREAM}"/>
  <g transform="translate(1439 880) scale(0.42) translate(-350 -701)">${figure('moved-', MOVED)}</g>
</g>`;

export function conceptSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#cd-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, NAME, 34, INK, 'font-weight="600"')}
${label(58, 106, '一張淡紫色的索引卡。你說話的時候，它一邊點頭，一邊把重要的話記在格線上。', 16)}
${label(58, 130, '肩膀的銅釘在嘴巴下方、釘在卡片邊緣內側；腿短短的，手長一點，最會擁抱；頭上戴一頂深青綠的紙貝雷帽。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
${tipMarks}
${main}
${label(56, 962, '摺摺系列 · 第三輪 · 卡片｜主姿勢「你好，我在聽」：右手套托起帽沿脫帽，左手張開', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
${placeCopy(1088, 206, 96)}${label(1070, 228, '96 px', 13)}
${placeCopy(1196, 206, 48)}${label(1178, 228, '48 px', 13)}
${placeCopy(1318, 206, 96, true)}${label(1290, 228, '剪影 96 px', 13)}
${placeCopy(1440, 206, 48, true)}${label(1414, 228, '剪影 48 px', 13)}
${placeCopy(1532, 206, 32)}${label(1516, 228, '32 px', 13)}
${label(1030, 252, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
${night}
${label(1030, 580, 'c ｜在首頁：坐在故事卡上讀標題', 15, INK)}${label(1308, 580, '被故事打動', 15, INK)}
${read}${moved}
${label(1032, 952, '坐在卡片上緣，腳垂在封面前晃，低頭讀', 12, MUTED)}${label(1310, 952, '卡片上寫滿聽到的話，眼睛瞇起，抱住自己', 12, MUTED)}
</svg>`;
}

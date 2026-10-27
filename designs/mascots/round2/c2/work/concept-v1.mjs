import { writeFileSync } from 'node:fs';
import { defs, tuck, C } from './tuck.mjs';
import { tear, spline, poly, path, pencil } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK) => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round" filter="url(#c2-graphite)">${pencil(pts, seed, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;
const POSE = { blushKind: 'hatch' };

const extraDefs = `<defs>
  <filter id="c2-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="c2-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="c2-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
  <clipPath id="c2-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="c2-clip-show"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="c2-clip-moved"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
</defs>`;

// figure in tuck space: x 130–670, y 150–705 (raised glove to foot), centre about 400,428
// main illustration: Tuck waving, big, on cream, a pencil ground line, one fallen offcut, three wave marks
const MS = 1.42, MX = 505, MY = 515;
const main = `<g transform="translate(${MX} ${MY}) scale(${MS}) translate(-400 -428)">${tuck('c2-', { ...POSE, wrap: '' })}</g>`;
const toMain = (x, y) => [MX + (x - 400) * MS, MY + (y - 428) * MS];
const ground = pencil([toMain(150, 696), toMain(330, 694), toMain(520, 697), toMain(700, 693)], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
const sc = toMain(640, 684);
const scrap = tear(spline([[sc[0] - 30, sc[1] + 6], [sc[0] + 4, sc[1] - 10], [sc[0] + 32, sc[1] + 2], [sc[0] + 20, sc[1] + 16], [sc[0] - 18, sc[1] + 18]], 5), 77, { jag: 0.9, wander: 3 });
// wave marks beside the raised glove (its centre 598,232, turned with the body's −4° tilt about 404,580)
const gl = (() => { const t = -4 * Math.PI / 180, x = 598.4 - 404, y = 231.7 - 580; return toMain(404 + x * Math.cos(t) - y * Math.sin(t), 580 + x * Math.sin(t) + y * Math.cos(t)); })();
const marks = [
  [[gl[0] + 60, gl[1] - 46], [gl[0] + 80, gl[1] - 64]],
  [[gl[0] + 70, gl[1] - 4], [gl[0] + 96, gl[1] - 8]],
  [[gl[0] + 58, gl[1] + 36], [gl[0] + 80, gl[1] + 48]],
  [[gl[0] - 10, gl[1] - 70], [gl[0] - 4, gl[1] - 94]],
].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

// (c1) the corner half open, the hidden lines showing, one long arm held out: come and read it with me
const show = `<g clip-path="url(#c2-clip-show)">
  <rect x="1030" y="592" width="262" height="360" fill="${CREAM}"/>
  <g transform="translate(1186 776) scale(0.39) translate(-400 -428)">${tuck('c2-show-', { ...POSE, wrap: '', flapS: -0.5, armL: 186, armR: 98, armBendL: -6, look: [-4, 0], blush: 0.85, tab: -14, legSquashR: 1, legSquashL: 0.9, tilt: -6 })}</g>
</g>`;
// (c2) moved by a story: eyes shut, brows only now, a tear, arms folded round itself, knees soft
const moved = `<g clip-path="url(#c2-clip-moved)">
  <rect x="1308" y="592" width="262" height="360" fill="${CREAM}"/>
  <g transform="translate(1439 780) scale(0.39) translate(-400 -428)">${tuck('c2-moved-', { ...POSE, wrap: '', legSquashR: 1, tilt: 2, closed: true, brow: 'worry', browOpacity: 0.85, mouth: 'soft', tear: true, blush: 0.95, armL: 33, armR: 147, armBendL: 8, armBendR: -8, legSquash: 0.86, legLean: [4, -4], tab: 22 })}</g>
</g>`;

const placeCopy = (x, y, h, sil = false) => `<g transform="translate(${x} ${y}) scale(${h / 555}) translate(-400 -428)"><use href="#c2-tuck"${sil ? ' filter="url(#c2-sil)"' : ''}/></g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#c2-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, '摺摺 Tuck', 34, INK, 'font-weight="600"')}
${label(58, 106, '一張被撕下來的色紙。它一直折著一個角，因為折角底下藏著幾行字。', 16)}
${label(58, 130, '這一輪：手臂是兩條釘在肩上的紙條，末端一顆奶油色紙手套，舉起來就高過頭頂。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
<path d="${path(scrap)}" style="fill:var(--c2-arm, ${C.arm})" filter="url(#c2-paper)"/>
${marks}
${main}
${label(56, 962, '方向 C′ ｜撕紙紙偶 · 主姿勢「嗨」 · 第二輪：只修手（銅釘肩、長紙條、奶油圓手套）', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
${placeCopy(1090, 150, 96)}${label(1072, 222, '96 px', 13)}
${placeCopy(1200, 174, 48)}${label(1182, 222, '48 px', 13)}
${placeCopy(1330, 150, 96, true)}${label(1302, 222, '剪影 96 px', 13)}
${placeCopy(1450, 174, 48, true)}${label(1424, 222, '剪影 48 px', 13)}
${placeCopy(1530, 182, 32)}${label(1514, 222, '32 px', 13)}
${label(1030, 250, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
<g clip-path="url(#c2-clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#c2-bggrain-night)" opacity="0.35"/>
  ${placeCopy(1300, 400, 238)}
</g>
${label(1030, 580, 'c ｜一起看嗎？', 15, INK)}${label(1308, 580, '被故事打動', 15, INK)}
${show}${moved}
${label(1032, 952, '折角掀開一半，伸手邀你一起看底下的字', 12, MUTED)}${label(1310, 952, '眼睛瞇起、眉毛出現，手臂抱住自己', 12, MUTED)}
</svg>`;
writeFileSync('../concept.svg', svg);

// The concept sheet (1600 × 1000), laid out like round 2's: the character large on the left in its main pose, on the
// right a) scale tests and silhouettes, b) the night paper, c) a landing-page vignette and an emotion.
import { G, BRADS, C, defs, mittenCentre } from './hush.mjs';
import { figure } from './rig.mjs';
import { pencil, tear, spline, path, rng } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const TERRA = 'oklch(62% 0.14 45)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK) => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round" filter="url(#nt-graphite)">${pencil(pts, seed, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;
const f1 = n => n.toFixed(1);

// the main pose: a small good-evening wave, the left mitten up beside the crown, the face turned toward it (round 3
// review: the arm turned a little further out, −128°, so the strip shows between the dome's edge and the mitten now
// that it comes out from under the sheet; the other arm at rest)
export const MAIN = { armL: -128, armR: G.rest.armR, tilt: 2, legL: 2, legR: -1.5, face: [-4, -1], look: [-1.5, -0.5] };
const rotAbout = ([x, y], deg, [px, py]) => { const a = deg * Math.PI / 180, dx = x - px, dy = y - py; return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)]; };

// a small word mark standing in for the footer's logo: the three waves and the name
const wordmark = (x, y, s = 1, col = 'oklch(92% 0.01 80)') => {
  const waves = [0, 1, 2].map(k => {
    const pts = []; for (let i = 0; i <= 12; i++) pts.push([x + i * 2.2 * s, y - 20 * s + k * 7 * s + Math.sin(i * 0.95) * 2.4 * s]);
    return pen(pts, 900 + k, 2.4 * s, 0.95, TERRA);
  }).join('');
  return `${waves}<text x="${x + 34 * s}" y="${y}" font-size="${25 * s}" fill="${col}" font-family="'Playfair Display','Georgia',serif" font-weight="700">Resonance</text>`;
};

export function conceptSvg() {
  const extraDefs = `<defs>
  <filter id="nt-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="nt-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="nt-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
  <clipPath id="nt-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="nt-clip-nap"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="nt-clip-yawn"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
  <g id="nt-hero">${figure('nt-hero-', MAIN)}</g>
</defs>`;

  // ---- main illustration: figure space → sheet: ground (y 700) at 884, centre x 350 → 520
  const MS = 1.52, MX = 520, MY = 880;
  const toMain = ([x, y]) => [MX + (x - 350) * MS, MY + (y - 700) * MS];
  const mainT = `translate(${f1(MX - 350 * MS)} ${f1(MY - 700 * MS)}) scale(${MS})`;
  const ground = pencil([toMain([110, 703]), toMain([300, 701]), toMain([480, 704]), toMain([640, 700])], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
  // pin-prick chads: the little paper circles the stars left behind, fallen by its feet
  const rr = rng(77);
  const chads = [[585, 699, 5], [604, 701, 3.6], [128, 701, 4.2]].map(([x, y, r], i) => {
    const [sx, sy] = toMain([x, y]);
    return `<path d="${path(tear(spline([[sx - r * MS, sy], [sx, sy - r * 0.55 * MS], [sx + r * MS, sy], [sx, sy + r * 0.45 * MS]], 2), 300 + i, { jag: 0.3, wander: 0.5 }))}" style="fill:${C.body}" filter="url(#nt-thin)"/>`;
  }).join('');
  // wave marks beside the raised mitten
  const g = toMain(rotAbout(mittenCentre('l', MAIN.armL), MAIN.tilt, [G.cx, G.hipY]));
  const marks = [
    [[g[0] - 52, g[1] - 40], [g[0] - 70, g[1] - 56]],
    [[g[0] - 64, g[1] + 4], [g[0] - 88, g[1] + 1]],
    [[g[0] - 50, g[1] + 44], [g[0] - 68, g[1] + 56]],
  ].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

  // ---- scale tests: the hero figure is ≈ 404 units tall (crown 298 to soles 702)
  const H0 = 404, CY0 = 500;
  const place = (x, yBase, h, sil = false) => { const s = h / H0; return `<g transform="translate(${f1(x - 350 * s)} ${f1(yBase - 702 * s)}) scale(${s.toFixed(4)})"><use href="#nt-hero"${sil ? ' filter="url(#nt-sil)"' : ''}/></g>`; };

  // ---- b: the night paper — the same pose, the stars' light coming through
  const nightFig = figure('nt-night-', { ...MAIN, glow: true });
  const nS = 0.56;
  const night = `<g clip-path="url(#nt-clip-night)">
    <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
    <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#nt-bggrain-night)" opacity="0.35"/>
    <g transform="translate(${f1(1300 - 350 * nS)} ${f1(512 - 702 * nS)}) scale(${nS})">${nightFig}</g>
  </g>`;

  // ---- c1: on the landing page — at night, asleep against the footer's word mark, sitting on the footer's line
  const napS = 0.34, napX = 1206, napY = 790; // napY: where its soles rest; dy lowers the body onto them (sitting)
  // asleep with both mittens on its tummy, the arms brought in front of the dome as the stage does for a nap
  const nap = figure('nt-nap-', { armL: 76, armR: 104, front: true, tilt: -9, dy: 86, legL: 8, legR: -8, eyeL: 'nap', eyeR: 'nap', mouth: 'smile', glow: true, face: [-4, 4], blush: 0.9 });
  const zs = [[napX + 36, 672, 11], [napX + 48, 650, 14], [napX + 38, 622, 18]].map(([x, y, s], i) => `<text x="${x}" y="${y}" font-size="${s}" fill="oklch(90% 0.02 250)" opacity="${0.5 + i * 0.15}" font-family="'Georgia',serif" font-style="italic">z</text>`).join('');
  const napPanel = `<g clip-path="url(#nt-clip-nap)">
    <rect x="1030" y="592" width="262" height="336" fill="${NIGHT}"/>
    <rect x="1030" y="592" width="262" height="336" fill="#000" filter="url(#nt-bggrain-night)" opacity="0.35"/>
    ${wordmark(1040, 787, 0.62)}
    <path d="M1046,846 L1276,846" stroke="oklch(34% 0.01 60)" stroke-width="1"/>
    <text x="1161" y="880" font-size="10" fill="oklch(62% 0.01 60)" text-anchor="middle" ${font}>© 2026 Resonance 版權所有</text>
    <g transform="translate(${f1(napX - 350 * napS)} ${f1(napY - 702 * napS)}) scale(${napS})">${nap}</g>
    ${zs}
  </g>`;

  // ---- c2: an emotion — sleepy: a yawn, one mitten rubbing an eye, the other eye drooping
  const yawnS = 0.56, yX = 1440, yY = 902;
  const yawn = figure('nt-yawn-', { armL: -38, armR: G.rest.armR + 4, front: true, tilt: -4, squash: 0.985, eyeL: 'nap', eyeR: 'sleepy', mouth: 'o', face: [-2, 1], legL: 1, legR: -1, blush: 0.65 });
  const yawnPanel = `<g clip-path="url(#nt-clip-yawn)">
    <rect x="1308" y="592" width="262" height="336" fill="${CREAM}"/>
    <g stroke="${INK}" stroke-width="1.2" opacity="0.22" fill="none" stroke-linecap="round">${pencil([[1326, 902], [1440, 900], [1552, 903]], 77, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>
    <g transform="translate(${f1(yX - 350 * yawnS)} ${f1(yY - 702 * yawnS)}) scale(${yawnS})">${yawn}</g>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#nt-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, '悄悄 Hush', 34, INK, 'font-weight="600"')}
${label(58, 106, '一片從紙劇場的夜空布景撕下來的深藍紙。底邊沿著地平線剪直，針刺的小孔是星星，頭上別著一枚月亮髮夾。', 16)}
${label(58, 130, '安安靜靜、有點睏，最喜歡在星光下聽故事；聽著聽著，就在頁尾睡著了。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
${chads}
${marks}
<g transform="${mainT}"><use href="#nt-hero"/></g>
${label(56, 962, '方向 C 系列 · 夜 ｜深藍撕紙圓頂 · 主姿勢「晚安的小招手」 · 銅釘在嘴線下、釘在紙面內 · 月亮髮夾 · 針孔星星', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
${place(1080, 204, 96)}${label(1062, 226, '96 px', 13)}
${place(1188, 204, 48)}${label(1170, 226, '48 px', 13)}
${place(1300, 204, 96, true)}${label(1268, 226, '剪影 96 px', 13)}
${place(1422, 204, 48, true)}${label(1392, 226, '剪影 48 px', 13)}
${place(1530, 204, 32)}${label(1514, 226, '32 px', 13)}
${label(1030, 252, 'b ｜夜紙 oklch(21% 0.012 60)：針孔透出星光', 15, INK)}
${night}
${label(1030, 580, 'c ｜在首頁：頁尾打盹', 15, INK)}${label(1308, 580, '睏了', 15, INK)}
${napPanel}${yawnPanel}
${label(1032, 952, '夜裡靠著頁尾的字標睡著，星星亮著', 12, MUTED)}${label(1310, 952, '打個呵欠，連指手套揉揉眼睛', 12, MUTED)}
</svg>`;
}

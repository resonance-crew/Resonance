// concept.svg: the sheet, laid out as round 2's (main pose left; scale tests, night paper and two vignettes right).
// Every figure on it is composed from the same parts as rig.svg (dot.mjs `figure`).
import { defs, figure, P, C } from './dot.mjs';
import { pencil, tear, spline, path } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK, dash = '') => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} filter="url(#dt-graphite)">${pencil(pts, seed, 2, 0.5).map(d => `<path d="${d}"/>`).join('')}</g>`;

// the main pose, "嗨!": the right mitten up and out in a wave, the body leaning a little the other way, one foot
// kicked out — it has just hopped in. The arms are tucked behind the disc, so the wave is out to the side (−8°),
// where the strip shows between the edge and the mitten (a raised short arm would hide its mitten behind the disc)
export const MAIN = { armL: 140, armR: -8, tilt: -4, look: [2, -1], legRotL: 7, legRotR: -2, blush: 0.8 };
// figure box in rig units for the main pose: x 215–479, y 454–706
const FIG = { x: 215, y: 454, w: 264, h: 252, cx: 350, cy: 580 };

const extraDefs = `<defs>
  <filter id="dt-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="dt-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="dt-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
  <clipPath id="dt-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="dt-clip-v1"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="dt-clip-v2"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
  <g id="dt-pose-main">${figure('dt-m-', MAIN)}</g>
</defs>`;

// a copy of the main pose whose full height (curls to soles) is h px, centred on (x, y)
const placeCopy = (x, y, h, sil = false) => `<g transform="translate(${x} ${y}) scale(${(h / FIG.h).toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})"><use href="#dt-pose-main"${sil ? ' filter="url(#dt-sil)"' : ''}/></g>`;

export function conceptSvg() {
  // ===== main illustration
  const MS = 2.2, MX = 548, MY = 548;
  const toMain = (x, y) => [MX + (x - FIG.cx) * MS, MY + (y - FIG.cy) * MS];
  const main = `<g transform="translate(${MX} ${MY}) scale(${MS}) translate(${-FIG.cx} ${-FIG.cy})"><use href="#dt-pose-main"/></g>`;
  const ground = pencil([toMain(40, 702), toMain(200, 700), toMain(400, 703), toMain(540, 699)], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
  // the two hops it came in on: dashed pencil arcs from the left, a tick where each landed
  const hop = (x0, x1, hgt, seed) => {
    const a = toMain(x0, 696), b = toMain(x1, 696), pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([a[0] + (b[0] - a[0]) * t, a[1] - Math.sin(Math.PI * t) * hgt]); }
    return pen(pts, seed, 1.8, 0.4, INK, '7 9');
  };
  const ticks = [toMain(150, 699), toMain(238, 699)].map(([x, y], i) => pen([[x - 12, y + 2], [x - 4, y - 8]], 620 + i, 1.6, 0.4) + pen([[x + 4, y - 8], [x + 12, y + 2]], 630 + i, 1.6, 0.4)).join('');
  // wave marks beside the raised mitten (its centre: right brad + 43 at −32°, turned with the body's tilt)
  const gl = (() => {
    const a = MAIN.armR * Math.PI / 180, gx = P.shoulderR[0] + P.armLen * Math.cos(a), gy = P.shoulderR[1] + P.armLen * Math.sin(a);
    const t = MAIN.tilt * Math.PI / 180, [px, py] = P.torsoPivot, x = gx - px, y = gy - py;
    return toMain(px + x * Math.cos(t) - y * Math.sin(t), py + x * Math.sin(t) + y * Math.cos(t));
  })();
  const marks = [
    [[gl[0] + 52, gl[1] - 46], [gl[0] + 70, gl[1] - 66]],
    [[gl[0] + 64, gl[1] + 2], [gl[0] + 90, gl[1] - 2]],
    [[gl[0] + 50, gl[1] + 46], [gl[0] + 70, gl[1] + 60]],
  ].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

  // ===== (c1) on the landing: it hops to the front of the early storytellers' row (their names run on to its right,
  // as on the page) and stands in line with them, one mitten on the first one's shoulder, waving with the other
  const av = [['oklch(86% 0.06 55)', '念'], ['oklch(80% 0.06 295)', '蕭'], ['oklch(79% 0.05 145)', '方'], ['oklch(88% 0.07 95)', 'TE']];
  const AY = 806, AR = 20;
  const avatars = av.map(([c, t], i) => {
    const x = 1152 + i * 31;
    return `<circle cx="${x}" cy="${AY}" r="${AR}" fill="${c}" stroke="${CREAM}" stroke-width="3"/>
      <text x="${x}" y="${AY + 5}" font-size="${t.length > 1 ? 11 : 14}" text-anchor="middle" fill="${INK}" ${font}>${t}</text>`;
  }).reverse().join('');
  const V1S = 0.4, V1X = 1088, V1F = AY + AR; // the dot stands on the row's baseline
  const v1 = `<g clip-path="url(#dt-clip-v1)">
    <rect x="1030" y="592" width="262" height="336" fill="${CREAM}"/>
    ${avatars}
    <g transform="translate(${V1X} ${V1F}) scale(${V1S}) translate(${-P.cx} ${-P.ground})">${figure('dt-v1-', { armL: -158, armR: 8, tilt: 3, look: [6, 0], legRotL: 3, legRotR: -4, blush: 0.9 })}</g>
    ${label(1124, V1F + 34, '成為一群最早說故事的人', 12.5, MUTED, 'font-style="italic"')}
  </g>`;

  // ===== (c2) joy: a story it likes — eyes shut, mouth open, a hop with its knees tucked and both mittens up
  const V2S = 0.58, V2X = 1439, V2F = 872;
  const hopFig = figure('dt-v2-', { armL: -160, armR: -20, eyes: 'shut', mouth: 'mouth-open', lift: 46, legRotL: 22, legRotR: -22, legSquashL: 0.72, legSquashR: 0.72, squash: 1.04, shadowScale: 0.62, blush: 1, deco: -6 });
  const sp = (x, y, r, seed) => pen([[x, y - r], [x, y + r]], seed, 1.6, 0.5) + pen([[x - r, y], [x + r, y]], seed + 1, 1.6, 0.5);
  const v2 = `<g clip-path="url(#dt-clip-v2)">
    <rect x="1308" y="592" width="262" height="336" fill="${CREAM}"/>
    <g transform="translate(${V2X} ${V2F}) scale(${V2S}) translate(${-P.cx} ${-P.ground})">${hopFig}</g>
    ${pen([[V2X - 22, V2F - 14], [V2X - 30, V2F - 4]], 701, 1.6, 0.45)}${pen([[V2X + 22, V2F - 14], [V2X + 30, V2F - 4]], 703, 1.6, 0.45)}
    ${sp(V2X - 74, 690, 6, 711)}${sp(V2X + 80, 676, 5, 713)}${sp(V2X + 66, 728, 4, 715)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#dt-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, '點點 Pip', 34, INK, 'font-weight="600"')}
${label(58, 106, '從別人的黃色筆記頁上打洞打下來的一顆小圓點。身上還留著兩條褪了色的橫線，和夾在中間、寫到一半的字。', 16)}
${label(58, 130, '系列裡最小的一隻（摺摺的 0.55 倍）：一條芥末色的捲紙條做成它的手、腳，和頭上三圈捲捲的頭髮；走路靠跳。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
${hop(40, 150, 110, 640)}${hop(150, 238, 70, 641)}${ticks}
${marks}
${main}
${label(56, 962, '方向 C 系列 · 第四輪 ｜手臂藏在紙後、銅釘在紙面上約 3 個釘半徑 · 臉在上半部、肚子是兩條褪色橫線 · 頭飾：三圈捲紙貼在頭上', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試（整隻高度）', 15, INK)}
${placeCopy(1084, 152, 96)}${label(1066, 222, '96 px', 13)}
${placeCopy(1186, 176, 48)}${label(1168, 222, '48 px', 13)}
${placeCopy(1250, 184, 32)}${label(1234, 222, '32 px', 13)}
${placeCopy(1352, 152, 96, true)}${label(1324, 222, '剪影 96 px', 13)}
${placeCopy(1470, 176, 48, true)}${label(1444, 222, '剪影 48 px', 13)}
${label(1222, 62, '首頁上實際約：桌機 81、平板 67、手機 54 px（含捲髮）', 12)}
${label(1030, 250, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
<g clip-path="url(#dt-clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#dt-bggrain-night)" opacity="0.35"/>
  ${placeCopy(1300, 400, 220)}
</g>
${label(1030, 580, 'c ｜在首頁：排進頭像列', 15, INK)}${label(1308, 580, '開心', 15, INK)}
${v1}${v2}
${label(1032, 952, '跳到早期說故事的人那一排的最前面，站好，揮手', 12, MUTED)}${label(1310, 952, '聽到喜歡的故事：閉上眼睛，縮腳蹦起來', 12, MUTED)}
</svg>`;
}

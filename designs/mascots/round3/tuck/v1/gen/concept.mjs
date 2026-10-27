// The concept sheet (1600 × 1000), laid out as round 2's: Tuck large on the left in its main pose ("hi"),
// on the right a) scale tests, b) the night paper, c) one landing-page activity and one emotion.
import * as T from './tk.mjs';
import { tear, spline, poly, path, pencil } from './lib.mjs';

const F = T.F;
export const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
export const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK) => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round" filter="url(#${F}graphite)">${pencil(pts, seed, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;

export const extraDefs = `<defs>
  <filter id="${F}bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="${F}bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="${F}sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
</defs>`;

// a posed figure's box in Tuck's coordinates (main pose): fringe/mitten top ≈ 236, soles 684, x ≈ 180–625
export const FIG = { cx: 405, cy: 462, h: 452 };
// where a point of the body lands once the body is tilted about its pivot
export function tilted([x, y], tilt) {
  const t = tilt * Math.PI / 180, [px, py] = T.BODY_PIVOT, dx = x - px, dy = y - py;
  return [px + dx * Math.cos(t) - dy * Math.sin(t), py + dx * Math.sin(t) + dy * Math.cos(t)];
}

export function concept() {
  const MS = 1.5, MX = 498, MY = 552;
  const toMain = ([x, y]) => [MX + (x - FIG.cx) * MS, MY + (y - FIG.cy) * MS];
  const main = `<g transform="translate(${MX} ${MY}) scale(${MS}) translate(${-FIG.cx} ${-FIG.cy})"><g id="${F}main">${T.figure('tk-m-', T.MAIN)}</g></g>`;
  const ground = pencil([toMain([150, 690]), toMain([330, 688]), toMain([520, 691]), toMain([700, 687])], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
  const sc = toMain([700, 682]);
  const scrap = tear(spline([[sc[0] - 26, sc[1] + 6], [sc[0] + 4, sc[1] - 9], [sc[0] + 28, sc[1] + 2], [sc[0] + 18, sc[1] + 14], [sc[0] - 16, sc[1] + 16]], 5), 77, { jag: 0.9, wander: 3 });
  // wave marks beside the raised mitten
  const gl = toMain(tilted(T.mittenAt('l', T.MAIN.armL), T.MAIN.tilt));
  const marks = [
    [[gl[0] - 66, gl[1] - 46], [gl[0] - 86, gl[1] - 64]],
    [[gl[0] - 78, gl[1] + 2], [gl[0] - 104, gl[1] - 2]],
    [[gl[0] - 64, gl[1] + 46], [gl[0] - 86, gl[1] + 58]],
    [[gl[0] - 4, gl[1] - 76], [gl[0] - 10, gl[1] - 100]],
  ].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

  const place = (x, y, h, sil = false) => `<g transform="translate(${x} ${y}) scale(${(h / FIG.h).toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})"><use href="#${F}main"${sil ? ` filter="url(#${F}sil)"` : ''}/></g>`;

  // (c1) on the landing page: sitting on a story card's top edge, legs over its front, the dog-ear lifted on its
  // writing and a mitten held up toward it
  const cardX = 1056, cardY = 832, cardW = 214, cardH = 130;
  const cardPaper = tear(poly([[cardX, cardY + 8], [cardX + 8, cardY], [cardX + cardW - 8, cardY], [cardX + cardW, cardY + 8], [cardX + cardW, cardY + cardH], [cardX, cardY + cardH]], 5), 88, { jag: 0.3, wander: 1 });
  const cover = tear(poly([[cardX + 11, cardY + 12], [cardX + cardW - 11, cardY + 12], [cardX + cardW - 11, cardY + 62], [cardX + 11, cardY + 62]], 5), 89, { jag: 0.4, wander: 1.2 });
  const cardTitle = pen([[cardX + 14, cardY + 80], [cardX + 80, cardY + 81], [cardX + 140, cardY + 79]], 830, 3.2, 0.45);
  const cardLines = pen([[cardX + 14, cardY + 96], [cardX + 90, cardY + 97], [cardX + cardW - 26, cardY + 96]], 820, 1.4, 0.22);
  const sitScale = 0.42, sitX = 1160, sitY = cardY - (T.BODY_PIVOT[1] - 6 - FIG.cy) * sitScale;
  const show = `<g clip-path="url(#${F}clip-show)">
    <rect x="1030" y="592" width="262" height="336" fill="${CREAM}"/>
    <path d="${path(cardPaper)}" fill="oklch(98.5% 0.008 85)" filter="url(#${F}thin)"/>
    <path d="${path(cover)}" fill="oklch(84% 0.045 290)" opacity="0.85" filter="url(#${F}thin)"/>
    ${cardTitle}${cardLines}
    <ellipse cx="${sitX + 4}" cy="${cardY + 6}" rx="56" ry="5" fill="${INK}" opacity="0.16" filter="url(#${F}crayon)"/>
    <g transform="translate(${sitX} ${sitY}) scale(${sitScale}) translate(${-FIG.cx} ${-FIG.cy})">${T.figure('tk-c1-', { flapS: 0.28, armL: 132, armR: -42, look: [5, -4], shadow: false, leanL: -2, leanR: 6, blush: 0.8 })}</g>
  </g>`;
  // (c2) an emotion: happy — a little hop, both mittens up and apart, eyes shut, mouth open
  const hp = { armL: -132, armR: -50, tilt: -2, lift: 26 };
  const hs = 0.4, hx = 1439, hy = 770;
  const toH = p => { const q = tilted(p, hp.tilt); return [hx + (q[0] - FIG.cx) * hs, hy + (q[1] - hp.lift - FIG.cy) * hs]; };
  const joy = ['l', 'r'].map((sk, j) => {
    const m = toH(T.mittenAt(sk, sk === 'l' ? hp.armL : hp.armR)), dir = sk === 'l' ? -1 : 1;
    return [[-0.9, -0.5], [-0.35, -1], [0.25, -1]].map(([ux, uy], i) => {
      const vx = ux * dir, l = Math.hypot(vx, uy);
      return pen([[m[0] + vx / l * 20, m[1] + uy / l * 20], [m[0] + vx / l * 30, m[1] + uy / l * 30]], 900 + j * 5 + i, 1.8, 0.5);
    }).join('');
  }).join('');
  const happy = `<g clip-path="url(#${F}clip-happy)">
    <rect x="1308" y="592" width="262" height="336" fill="${CREAM}"/>
    <g transform="translate(${hx} ${hy}) scale(${hs}) translate(${-FIG.cx} ${-FIG.cy})">${T.figure('tk-c2-', { ...hp, eyes: 'shut', mouth: 'open', blush: 0.95, squashL: 0.92, squashR: 0.92, decoRot: -4 })}</g>
    ${joy}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${T.defs()}${extraDefs}
<defs>
  <clipPath id="${F}clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="${F}clip-show"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="${F}clip-happy"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
</defs>
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#${F}bggrain)" opacity="0.5"/>
${label(56, 74, '摺摺 Tuck', 34, INK, 'font-weight="600"')}
${label(58, 106, '一張被撕下來的色紙。它一直折著一個角，因為折角底下藏著幾行字。', 16)}
${label(58, 130, '第三輪：肩膀放到嘴巴下方，銅釘釘進紙面裡，手臂短一點；頭上的紙舌換成用迴紋針夾起來的紙瀏海。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
<path d="${path(scrap)}" style="fill:var(--tk-arm, ${T.C.arm})" filter="url(#${F}paper)"/>
${marks}
${main}
${label(56, 962, '方向 C ｜撕紙紙偶 · 主姿勢「嗨」 · 第三輪修訂：肩膀下移、銅釘內移、手臂縮短、迴紋針瀏海', 14)}
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
${place(1090, 150, 96)}${label(1072, 222, '96 px', 13)}
${place(1200, 174, 48)}${label(1182, 222, '48 px', 13)}
${place(1330, 150, 96, true)}${label(1302, 222, '剪影 96 px', 13)}
${place(1450, 174, 48, true)}${label(1424, 222, '剪影 48 px', 13)}
${place(1532, 182, 32)}${label(1516, 222, '32 px', 13)}
${label(1030, 250, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
<g clip-path="url(#${F}clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#${F}bggrain-night)" opacity="0.35"/>
  ${place(1300, 402, 236)}
</g>
${label(1030, 580, 'c ｜在首頁：坐在故事卡上', 15, INK)}${label(1308, 580, '開心', 15, INK)}
${show}${happy}
${label(1032, 952, '坐在卡片頂邊，掀開折角，舉手要你看底下的字', 12, MUTED)}${label(1310, 952, '原地一跳，兩手張開舉高，眼睛笑成彎線', 12, MUTED)}
</svg>`;
}

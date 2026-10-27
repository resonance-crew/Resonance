// node work/r3/beforeafter.mjs → checks/review-before-after.svg: the first pass (v1/gen) beside the revision (gen), same scale
import { writeFileSync } from 'node:fs';
const A = { rig: await import('../../v1/gen/rig.mjs'), h: await import('../../v1/gen/hush.mjs') };
const B = { rig: await import('../../gen/rig.mjs'), h: await import('../../gen/hush.mjs') };
const ns = (s, p) => s.replace(/id="nt-/g, `id="${p}nt-`).replace(/url\(#nt-/g, `url(#${p}nt-`);
const defsA = ns(A.h.defs(), 'a-').replace(/<\/?defs>/g, ''), defsB = ns(B.h.defs(), 'b-').replace(/<\/?defs>/g, '');
const fa = (o = {}, I = 'a') => ns(A.rig.figure(`${I}-`, o), 'a-'), fb = (o = {}, I = 'b') => ns(B.rig.figure(`${I}-`, o), 'b-');
const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(30% 0.03 60)', MUTED = 'oklch(50% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const T = (x, y, t, size = 14, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const sil = `<filter id="sil" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
// a figure placed so its height (crown ≈ 298 → soles 702, 404 units) is h px, its centre at x, its soles at base
const at = (x, base, h, inner, extra = '') => { const s = h / 404; return `<g transform="translate(${(x - 350 * s).toFixed(1)} ${(base - 702 * s).toFixed(1)}) scale(${s.toFixed(4)})"${extra}>${inner}</g>`; };
const tile = (x, y, w, h, bg) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${bg}"/>`;
const crop = (x, y, w, h, vb, inner, bg) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}"/><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.join(' ')}" overflow="hidden">${inner}</svg>`;
const W = 1440, H = 1070;
const ra = fa({}, 'ra'), rb = fb({}, 'rb'), rag = fa({ glow: true }, 'rag'), rbg = fb({ glow: true }, 'rbg');
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defsA}${defsB}${sil}</defs>
<rect width="${W}" height="${H}" fill="oklch(98.5% 0.006 75)"/>
${T(40, 50, '悄悄 Hush · 第三輪評審前後（同一比例，靜止站姿）', 24, INK, 'font-weight="600"')}
${T(40, 78, '左：第一輪交稿（v1）　右：評審後修改', 14)}`;
// row 1: large, day and night
const bigH = 262, y1 = 100, tw = 330, th = 340;
[[40, ra, rag, '第一輪'], [740, rb, rbg, '評審後']].forEach(([x, d, n, lab]) => {
  s += tile(x, y1, tw, th, DAY) + at(x + tw / 2, y1 + th - 22, bigH, d) + tile(x + tw + 10, y1, tw, th, NIGHT) + at(x + tw * 1.5 + 10, y1 + th - 22, bigH, n);
  s += T(x + 12, y1 + 24, lab, 15, INK, 'font-weight="600"') + T(x + tw + 22, y1 + 24, lab + '（夜紙）', 13, 'oklch(80% 0.01 60)');
});
s += `<line x1="720" y1="${y1}" x2="720" y2="${y1 + th}" stroke="${INK}" stroke-width="1" opacity="0.15"/>`;
// row 2: true size — 120 px and 48 px on both papers, the 48 px silhouette
const y2 = 470, rh = 150;
[[40, ra, rag, 'a'], [740, rb, rbg, 'b']].forEach(([x, d, n, k]) => {
  s += tile(x, y2, 300, rh, DAY) + at(x + 75, y2 + rh - 14, 120, d) + at(x + 220, y2 + rh - 14, 48, d) + at(x + 272, y2 + rh - 14, 32, d);
  s += tile(x + 310, y2, 230, rh, NIGHT) + at(x + 385, y2 + rh - 14, 120, n) + at(x + 500, y2 + rh - 14, 48, n);
  s += tile(x + 550, y2, 110, rh, '#fff') + at(x + 605, y2 + rh - 14, 48, d, ' filter="url(#sil)"');
});
s += T(40, y2 + rh + 22, '實際大小：120 px（桌機舞台）、48 px、32 px；夜紙 120 / 48 px；48 px 剪影', 13) + T(740, y2 + rh + 22, '同上', 13);
// row 3: details at 3×, before → after
const y3 = 680, cw = 200, ch = 150;
const details = [
  { vb: [150, 430, 120, 90], a: ra, b: rb, t: '肩膀：手臂藏到紙後，銅釘往內移到紙面上|（離撕邊 17.6 → 25，約 3 個銅釘半徑）', bg: DAY },
  { vb: [395, 295, 100, 75], a: ra, b: rb, t: '月亮：收進圓頂，剪影不再冒出尖角；|外圈改成一支銅髮夾（第一輪的圈被看成光環）', bg: DAY },
  { vb: [262, 386, 176, 132], a: ra, b: rb, t: '臉：眼睛換成暖白鉛筆、塗實；|嘴的筆畫 ×1.4、弧長 ×1.2', bg: DAY },
];
details.forEach((d, i) => {
  const x = 40 + i * 470;
  s += crop(x, y3, cw, ch, d.vb, d.a, d.bg) + crop(x + cw + 10, y3, cw, ch, d.vb, d.b, d.bg);
  s += T(x + 6, y3 + 18, '前', 12, INK) + T(x + cw + 16, y3 + 18, '後', 12, INK);
  const words = d.t.split('|');
  words.forEach((w, k) => { s += T(x, y3 + ch + 22 + k * 19, w, 13); });
});
// row 4: the night crop of the feet and the paper — what the blind reader saw vanish
const y4 = 920;
s += crop(40, y4, 300, 130, [150, 578, 400, 173], rag, NIGHT) + crop(350, y4, 300, 130, [150, 578, 400, 173], rbg, NIGHT);
s += T(46, y4 + 18, '前', 12, 'oklch(85% 0.01 60)') + T(356, y4 + 18, '後', 12, 'oklch(85% 0.01 60)');
s += T(670, y4 + 30, '夜紙上：身體亮一階（L 40% → 43.5%），鞋底改用比腿深一階的板岩藍（原本的深藍鞋底在夜紙上看不見）；', 13);
s += T(670, y4 + 52, '紙面的淺色纖維點和雲紋減少，第一輪被看成不織布或絨布；撕邊白纖維寬一點、毛邊少一點，夜裡的輪廓靠它。', 13);
s += T(670, y4 + 74, '手套靜止時比第一輪往外 12°，紙條才看得到從撕邊下伸出來；看得到的手臂比第一輪短。', 13);
s += '</svg>';
writeFileSync('checks/review-before-after.svg', s);

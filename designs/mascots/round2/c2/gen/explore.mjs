// Round 2 exploration: three ways to give Tuck real arms, side by side on the same (unchanged) body.
import { writeFileSync } from 'node:fs';
import { defs, tuck } from '../work/tuck-v1.mjs'; // the comparison sheet of the first round-2 version (drawn before review)
const CREAM = 'oklch(96.5% 0.015 75)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const T = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const base = { wrap: '', blushKind: 'hatch' };
const options = [
  { key: 'a', title: '甲 長紙條 · 深鼠尾草', lines: ['和腳同一張邊角料，再深一階', '肩到手 194：舉起時手套整顆高過頭頂', '奶油圓手套（折角背面的紙）＋一點字跡'],
    pose: { ...base } },
  { key: 'b', title: '乙 兩節紙條 · 牛皮紙', lines: ['肩、肘各一顆銅釘，像傳統紙偶', '總長同甲；揮手時前臂往上折', '奶油圓手套，不帶字'],
    pose: { ...base, armColor: 'oklch(70% 0.06 68)', gloveInk: false, armR: -18, elbowR: { at: 0.46, bend: -66 }, armL: 100, elbowL: { at: 0.5, bend: 18 } } },
  { key: 'c', title: '丙 短紙條 · 赤陶', lines: ['肩到手 140：舉起時手只到頭頂邊', '末端是一張小方紙，也折一個角', '呼應折角，但不像手'],
    pose: { ...base, armColor: 'oklch(63% 0.1 42)', handKind: 'square', armDL: 140, armDR: 140, gloveR: 27, armL: 108 } },
];
const SIL = `<filter id="c2-x-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.09  0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 7 -2.2"/></filter>`;
let g = '';
options.forEach((op, i) => {
  const x0 = i * 500;
  const id = `c2-x${op.key}-`;
  g += `<g transform="translate(${x0 + 250} 350) scale(0.64) translate(-400 -430)">${tuck(id, op.pose)}</g>`;
  // black silhouette, 160 px tall
  g += `<g transform="translate(${x0 + 120} 640) scale(0.3) translate(-400 -430)"><use href="#${id}tuck" filter="url(#c2-x-sil)"/></g>`;
  // 48 px: colour and silhouette
  g += `<g transform="translate(${x0 + 300} 640) scale(0.09) translate(-400 -430)"><use href="#${id}tuck"/></g>`;
  g += `<g transform="translate(${x0 + 380} 640) scale(0.09) translate(-400 -430)"><use href="#${id}tuck" filter="url(#c2-x-sil)"/></g>`;
  g += T(x0 + 30, 40, op.title, 20, INK, 'font-weight="600"');
  op.lines.forEach((l, k) => { g += T(x0 + 30, 66 + k * 20, l, 13); });
  g += T(x0 + 96, 748, '剪影', 12) + T(x0 + 290, 748, '48 px', 12) + T(x0 + 362, 748, '48 px 剪影', 12);
  if (i) g += `<path d="M${x0},20 L${x0},760" stroke="${INK}" stroke-width="1" opacity="0.12"/>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 770" width="1500" height="770">
${defs()}<defs>${SIL}</defs>
<rect width="1500" height="770" fill="${CREAM}"/>
${g}
</svg>`;
writeFileSync('../explore.svg', svg);

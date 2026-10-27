// Rig check for the revised arms: one drawing (both arms hanging), every pose made only by rotating
// c2-arm-l / c2-arm-r about their brads (and c2-body about its pivot) — no geometry is redrawn.
import { writeFileSync } from 'node:fs';
import { defs, tuck } from '../gen/tuck.mjs';
const base = (P) => tuck(P, { blushKind: 'hatch', armL: 106, armR: 76, tilt: 0, legSquashR: 1, wrap: '' });
const poses = [
  ['畫的樣子（兩手垂下 106° / 76°）', 0, 0, 0],
  ['主姿勢：左手舉起（−114°）', -220, 0, 4],
  ['雙手舉起（左 −124°、右 −45°）', -230, -121, 0],
  ['抱住自己（左 30°、右 150°）', -76, 74, 2],
  ['身體搖擺 −8°（腿在身體外）', 0, -20, -8],
];
const SIL = `<filter id="c2-r-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
let g = '';
poses.forEach(([t, l, r, tilt], i) => {
  const P = `c2-r${i}-`;
  let s = base(P);
  s = s.replace(`<g id="${P}arm-l">`, `<g id="${P}arm-l" transform="rotate(${l} 249 420)">`)
       .replace(`<g id="${P}arm-r">`, `<g id="${P}arm-r" transform="rotate(${r} 565 430)">`)
       .replace(/<g id="(c2-r\d-body)" transform="rotate\(0 404 580\)">/, `<g id="$1" transform="rotate(${tilt} 404 580)">`);
  const x = 160 + i * 300;
  g += `<g transform="translate(${x} 250) scale(0.5) translate(-414 -461)">${s}</g>`;
  g += `<g transform="translate(${x} 520) scale(0.22) translate(-414 -461)"><use href="#${P}tuck" filter="url(#c2-r-sil)"/></g>`;
  g += `<text x="${x}" y="30" text-anchor="middle" font-size="14" fill="oklch(40% 0.03 60)" font-family="PingFang TC">${t}</text>`;
});
writeFileSync('../work/rig2.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 640" width="1500" height="640">${defs()}<defs>${SIL}</defs><rect width="1500" height="640" fill="oklch(96.5% 0.015 75)"/><style>[id$="-shadow"]{opacity:1}</style>${g}</svg>`);

// Form self-check: black silhouette at 200 px and 48 px, upside down, mirrored; colour at 48 / 96 px.
import { writeFileSync } from 'node:fs';
import { defs, tuck, MAIN } from './tuck.mjs';
const CREAM = 'oklch(96.5% 0.015 75)', MUTED = 'oklch(45% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const SIL = `<filter id="c2-f-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
// figure bounds in tuck space (main pose) ≈ x 191–637, y 222–700 → centre 414,461, height ≈ 480
const H = 480, cx = 414, cy = 461;
const place = (x, y, h, extra = '', sil = true) => `<g transform="translate(${x} ${y}) ${extra} scale(${h / H}) translate(${-cx} ${-cy})"><use href="#c2-f-tuck"${sil ? ' filter="url(#c2-f-sil)"' : ''}/></g>`;
const lab = (x, y, t) => `<text x="${x}" y="${y}" font-size="14" fill="${MUTED}" ${font} text-anchor="middle">${t}</text>`;
let g = `<g visibility="hidden">${tuck('c2-f-', { ...MAIN, wrap: '' })}</g>`;
g += `<style>#c2-f-shadow{display:none}</style>`;
g += place(130, 150, 200) + lab(130, 290, '剪影 200 px');
g += place(370, 150, 200, 'rotate(180)') + lab(370, 290, '上下顛倒');
g += place(610, 150, 200, 'scale(-1 1)') + lab(610, 290, '左右翻轉');
g += place(800, 150, 48) + place(860, 150, 48, 'rotate(180)') + place(920, 150, 48, 'scale(-1 1)') + lab(860, 290, '剪影 48 px（正／倒／翻）');
g += place(1060, 150, 48, '', false) + place(1140, 150, 96, '', false) + lab(1100, 290, '彩色 48 / 96 px');
writeFileSync('../work/formcheck.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1220 310" width="1220" height="310">${defs()}<defs>${SIL}</defs><rect width="1220" height="310" fill="${CREAM}"/>${g}</svg>`);

// silhouette comparison sheet of the rest rig: color + black, upright, flipped, upside down, at 200/96/48 px
import { readFileSync, writeFileSync } from 'node:fs';
const rig = readFileSync(process.argv[2], 'utf8').replace(/<\?xml[^>]*>/, '');
const inner = rig.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const box = { x: 215, y: 450, w: 270, h: 262 };
const cell = (x, y, h, { sil = false, flip = false, inv = false } = {}) => {
  const s = h / box.h;
  const t = `translate(${x} ${y}) scale(${flip ? -s : s} ${inv ? -s : s}) translate(${-(box.x + box.w / 2)} ${-(box.y + box.h / 2)})`;
  return `<g transform="${t}"${sil ? ' filter="url(#sil)"' : ''}><use href="#fig"/></g>`;
};
const W = 1100, H = 300;
let g = '';
let x = 110;
for (const [h, o] of [[200, {}], [200, { sil: true }], [96, { sil: true }], [48, { sil: true }], [96, { sil: true, flip: true }], [96, { sil: true, inv: true }], [48, {}]]) { g += cell(x, 150, h, o); x += h / 2 + 90; }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><filter id="sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>
<g id="fig">${inner}</g></defs>
<rect width="${W}" height="${H}" fill="oklch(96.5% 0.015 75)"/>${g}</svg>`;
writeFileSync(process.argv[3], svg);

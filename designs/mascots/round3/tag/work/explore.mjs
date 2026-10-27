// node work/explore.mjs → work/explore.svg: variants side by side at 120 px and 48 px on day and night paper, + silhouettes
import { writeFileSync } from 'node:fs';
import { defs, G } from '../gen/tag.mjs';
import { figure } from '../gen/concept.mjs';
const base = JSON.parse(JSON.stringify(G));
const reset = () => Object.assign(G, JSON.parse(JSON.stringify(base)));
const shiftFace = dy => { for (const k of ['eyeL', 'eyeR', 'mouth', 'cheekL', 'cheekR', 'faceCenter']) G[k] = [G[k][0], G[k][1] + dy]; G.writeY += dy; };
const V = [
  ['v1', () => { G.bradL = [270, 394]; G.bradR = [430, 394]; G.armRest = [102, 78]; G.bow.tilt = -3; }],
  ['brads 106°', () => { G.armRest = [106, 74]; }],
  ['brads 110°', () => {}],
  ['110 + tie bow', () => { G.bow = { L: [68, 70], h: [34, 35], shape: 'tie', tilt: 0 }; }],
  ['+ face ↓12', () => { G.bow = { L: [68, 70], h: [34, 35], shape: 'tie', tilt: 0 }; shiftFace(12); }],
  ['+ legs wider', () => { G.bow = { L: [68, 70], h: [34, 35], shape: 'tie', tilt: 0 }; shiftFace(12); G.legW = { up: [25, 28], low: [25, 22] }; }],
];
const FH = 583, FX = 350, FY = 410;
let hidden = '', out = '';
V.forEach(([name, f], i) => { reset(); f(); hidden += figure(`tg-x${i}-`, { noShadow: false }); hidden += figure(`tg-xb${i}-`, { back: true }); });
reset();
const at = (id, x, y, h, sil) => `<g transform="translate(${x} ${y}) scale(${h / FH}) translate(${-FX} ${-FY})"><use href="#${id}"${sil ? ' filter="url(#sil)"' : ''}/></g>`;
const W = 180;
V.forEach(([name], i) => {
  const x = 90 + i * W;
  out += `<text x="${x}" y="22" font-size="13" text-anchor="middle" font-family="PingFang TC">${name}</text>`;
  out += at(`tg-x${i}-fig`, x - 35, 140, 167) + at(`tg-xb${i}-fig`, x + 45, 140, 167);
  out += at(`tg-x${i}-fig`, x - 50, 300, 48) + at(`tg-x${i}-fig`, x - 10, 300, 96, true) + at(`tg-x${i}-fig`, x + 50, 300, 48, true);
  out += at(`tg-x${i}-fig`, x - 35, 450, 167) + at(`tg-x${i}-fig`, x + 45, 450, 48);
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V.length * W} 560" width="${V.length * W}" height="560">${defs()}
<defs><filter id="sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter></defs>
<g visibility="hidden">${hidden}</g>
<rect width="100%" height="360" fill="oklch(96.5% 0.015 75)"/><rect y="360" width="100%" height="200" fill="oklch(21% 0.012 60)"/>
${out}</svg>`;
writeFileSync('work/explore.svg', svg);
console.log('ok');

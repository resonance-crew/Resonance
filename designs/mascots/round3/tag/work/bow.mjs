// node work/bow.mjs → work/bow.svg: bow shapes at true pixel size (1×): colour 167/96/48 and silhouettes 96/48
import { writeFileSync } from 'node:fs';
import { defs, G } from '../gen/tag.mjs';
import { figure } from '../gen/concept.mjs';
const base = JSON.parse(JSON.stringify(G));
const reset = () => Object.assign(G, JSON.parse(JSON.stringify(base)));
const V = [
  ['v1', { L: [64, 68], h: [40, 42], shape: 'v1', tilt: -3 }],
  ['v1 centred', { L: [64, 68], h: [40, 42], shape: 'v1', tilt: 0 }],
  ['tie 68/34', { L: [68, 70], h: [34, 35], shape: 'tie', tilt: 0 }],
  ['tie 72/30', { L: [72, 74], h: [30, 31], shape: 'tie', tilt: 0 }],
];
const FH = 583, FX = 350, FY = 410;
const at = (inner, x, y, h, sil) => `<g transform="translate(${x} ${y}) scale(${h / FH}) translate(${-FX} ${-FY})"${sil ? ' filter="url(#sil)"' : ''}>${inner}</g>`;
let out = '';
const W = 150;
V.forEach(([name, bw], i) => {
  reset(); G.bow = bw;
  const x = 75 + i * W;
  out += `<text x="${x}" y="14" font-size="11" text-anchor="middle" font-family="PingFang TC">${name}</text>`;
  out += at(figure(`tg-b${i}a-`, { noShadow: true }), x - 20, 120, 167);
  out += at(figure(`tg-b${i}b-`, { noShadow: true }), x + 50, 90, 96);
  out += at(figure(`tg-b${i}c-`, { noShadow: true }), x + 50, 170, 48);
  out += at(figure(`tg-b${i}d-`, { noShadow: true }), x - 30, 270, 96, true);
  out += at(figure(`tg-b${i}e-`, { noShadow: true }), x + 40, 270, 48, true);
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V.length * W} 330" width="${V.length * W}" height="330">${defs()}
<defs><filter id="sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter></defs>
<rect width="100%" height="100%" fill="oklch(96.5% 0.015 75)"/>
${out}</svg>`;
writeFileSync('work/bow.svg', svg);

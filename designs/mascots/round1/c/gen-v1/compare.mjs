import { writeFileSync } from 'node:fs';
import { defs, tuck } from './tuck.mjs';
const variants = [
  ['tab + 舊摺痕', { top: 'tab' }],
  ['無 tab + 舊摺痕', { top: 'plain' }],
  ['tab 無摺痕', { top: 'tab', creases: false }],
];
let g = '';
variants.forEach(([n, p], i) => {
  const x = i * 520;
  g += `<g transform="translate(${x + 200} 300) scale(0.72) translate(-404 -470)">${tuck('v' + i + '-', { ...p, wrap: '' })}</g>
  <g transform="translate(${x + 440} 220) scale(0.1) translate(-404 -470)"><use href="#v${i}-c-tuck"/></g>
  <text x="${x + 200}" y="590" font-size="18" text-anchor="middle" font-family="PingFang TC">${n}</text>`;
});
writeFileSync('../compare.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1560 600" width="1560" height="600">${defs()}<rect width="1560" height="600" fill="oklch(96.5% 0.015 75)"/>${g}</svg>`);

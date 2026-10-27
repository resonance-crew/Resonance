import { writeFileSync } from 'node:fs';
import { defs, tuck, MAIN } from '../gen/tuck.mjs';
const opts = [
  ['麥黃（採用）', ''],
  ['玫瑰（第一輪）', '--c2-leg: oklch(82% 0.05 22); --c2-leg-fold: oklch(71% 0.06 20);'],
  ['深鼠尾草', '--c2-leg: oklch(74% 0.045 143); --c2-leg-fold: oklch(64% 0.05 143);'],
];
let g = '';
opts.forEach(([t, css], i) => {
  g += `<g style="${css}" transform="translate(${200 + i * 400} 330) scale(0.62) translate(-414 -461)">${tuck(`c2-L${i}-`, { ...MAIN, wrap: '' })}</g>`;
  g += `<text x="${200 + i * 400}" y="40" text-anchor="middle" font-size="18" font-family="PingFang TC">${t}</text>`;
  g += `<rect x="${i * 400 + 40}" y="520" width="320" height="200" rx="10" fill="oklch(21% 0.012 60)"/>`;
  g += `<g style="${css}" transform="translate(${200 + i * 400} 620) scale(0.36) translate(-414 -461)"><use href="#c2-L${i}-tuck"/></g>`;
});
writeFileSync('../work/legs-test.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 740" width="1200" height="740">${defs()}<rect width="1200" height="740" fill="oklch(96.5% 0.015 75)"/>${g}</svg>`);

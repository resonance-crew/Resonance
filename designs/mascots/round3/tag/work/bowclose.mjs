import { writeFileSync } from 'node:fs';
import { defs, G } from '../gen/tag.mjs';
import { figure } from '../gen/concept.mjs';
const base = JSON.parse(JSON.stringify(G));
const reset = () => Object.assign(G, JSON.parse(JSON.stringify(base)));
const V = [
  ['v1 centred', { L: [64, 68], h: [40, 42], shape: 'v1', tilt: 0 }],
  ['tie 68/34', { L: [68, 70], h: [34, 35], shape: 'tie', tilt: 0 }],
  ['tie 66/37', { L: [66, 68], h: [37, 38], shape: 'tie', tilt: 0 }],
];
let out = '';
V.forEach(([name, bw], i) => {
  reset(); G.bow = bw;
  out += `<g transform="translate(${i * 260 - 220} -80)">${figure(`tg-c${i}-`, { noShadow: true })}</g><text x="${i * 260 + 130}" y="20" font-size="14" text-anchor="middle">${name}</text>`;
});
writeFileSync('work/bowclose.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 260" width="780" height="260">${defs()}<rect width="100%" height="100%" fill="oklch(96.5% 0.015 75)"/>${out}</svg>`);

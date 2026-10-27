import * as T from '../gen/tk.mjs';
import { writeFileSync } from 'node:fs';
const fig = (I, pose, x) => `<g transform="translate(${x} 0)">${T.figure(I, pose)}</g>`;
const angs = [-72, -80, -88];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 200 1500 520" width="1500" height="520">${T.defs()}
<rect x="150" y="200" width="1500" height="520" fill="oklch(96.5% 0.015 75)"/>
${angs.map((a, i) => fig('tk-q' + i + '-', { flapS: 0.28, armR: a, front: ['r'], mouth: 'open', look: [3, -2], tilt: -2 }, i * 480)).join('')}</svg>`;
writeFileSync(process.argv[2], svg);

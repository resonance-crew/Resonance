// scratch: render posed figures large (rest, hi, reveal) for looking — node work/peek.mjs <out.svg>
import * as T from '../gen/tk.mjs';
import { writeFileSync } from 'node:fs';
const k = 1.0;
const fig = (I, pose, x) => `<g transform="translate(${x} 0)">${T.figure(I, pose)}</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 200 1500 520" width="1500" height="520">${T.defs()}
<rect x="150" y="200" width="1500" height="520" fill="oklch(96.5% 0.015 75)"/>
${fig('tk-p1-', {}, 0)}${fig('tk-p2-', T.MAIN, 480)}${fig('tk-p3-', { flapS: 0.28, armR: -109, front: ['r'], mouth: 'open', look: [3, -2] }, 960)}</svg>`;
writeFileSync(process.argv[2], svg);

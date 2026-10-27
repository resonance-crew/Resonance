import * as T from '../gen/tk.mjs';
import * as V1 from '../v1/gen/tk.mjs';
import { FIG } from '../gen/concept.mjs';
import { writeFileSync } from 'node:fs';
// 2× device pixels of a 120 css px stage figure: the sheet-to-ground 435 Tuck units = 240 px
const k = 240 / (T.GROUND - T.TOP);
const at = (x, inner) => `<g transform="translate(${x} 150) scale(${k}) translate(${-FIG.cx} ${-FIG.cy})">${inner}</g>`;
const bg = (x, c) => `<rect x="${x}" y="0" width="560" height="300" fill="${c}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 300" width="1120" height="300">${T.defs()}
${bg(0, 'oklch(96.5% 0.015 75)')}${bg(560, 'oklch(21% 0.012 60)')}
${at(140, V1.figure('tk-x1-', { flapS: 0.28, armR: 53, mouth: 'open', look: [4, -3] }))}${at(410, T.figure('tk-x2-', T.REVEAL))}
${at(700, V1.figure('tk-x3-', { flapS: 0.28, armR: 53, mouth: 'open', look: [4, -3] }))}${at(970, T.figure('tk-x4-', T.REVEAL))}</svg>`;
writeFileSync(process.argv[2], svg);

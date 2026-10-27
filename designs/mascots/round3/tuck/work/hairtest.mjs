import * as T from '../gen/tk.mjs';
import { writeFileSync } from 'node:fs';
const vars = ['', '--tk-hair: oklch(69% 0.088 82); --tk-hair-light: oklch(80.5% 0.075 88)', '--tk-hair: oklch(66% 0.09 80); --tk-hair-light: oklch(78% 0.08 86)'];
const fig = (I, st, x) => `<g transform="translate(${x} 0)" style="${st}">${T.figure(I, {})}</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 200 1440 500" width="1440" height="500">${T.defs()}
${vars.map((v, i) => fig('tk-h' + i + '-', v, i * 480)).join('')}</svg>`;
writeFileSync(process.argv[2], svg);

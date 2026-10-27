import { writeFileSync } from 'node:fs';
import { defs, figure } from '../gen/dot.mjs';
writeFileSync('work/shy.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="200 410 300 310" width="600" height="620">${defs()}<rect x="0" y="0" width="760" height="760" fill="oklch(96.5% 0.015 75)"/>${figure('dt-shy-', { armL: -53, armR: -129, eyes: 'shut', blush: 1, tilt: 3 })}</svg>`);

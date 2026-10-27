import { writeFileSync } from 'node:fs';
import { defs, tuck, setShapes } from '../gen/tuck.mjs';
const combos = [['strip', 'lean'], ['strip', 'lean', 'back'], ['strip', 'stem', 'back'], ['petal', 'lean']];
let g = '';
combos.forEach(([h, t, f], i) => {
  setShapes(h, t, f);
  g += `<g transform="translate(${i * 400} 0) scale(0.5)">${tuck('s' + i + '-')}</g><text x="${i * 400 + 200}" y="420" text-anchor="middle" font-size="16">${h} / ${t} / ${f}</text>`;
});
writeFileSync(new URL('./shapes.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 440" width="1600" height="440">${defs()}<rect width="1600" height="440" fill="oklch(96.5% 0.015 75)"/>${g}</svg>`);

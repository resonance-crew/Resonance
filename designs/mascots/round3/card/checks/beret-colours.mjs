import { writeFileSync } from 'node:fs';
import { defs } from '../gen/card.mjs';
import { figure } from '../gen/figure.mjs';
const opts = [
  ['芥末黃', 'oklch(70% 0.098 80)', 'oklch(56% 0.08 64)'],
  ['深青綠', 'oklch(52% 0.06 195)', 'oklch(42% 0.05 200)'],
  ['靛藍', 'oklch(44% 0.06 268)', 'oklch(35% 0.05 270)'],
  ['酒紅', 'oklch(46% 0.085 18)', 'oklch(37% 0.07 18)'],
  ['可可棕', 'oklch(50% 0.05 55)', 'oklch(40% 0.04 50)'],
];
const cell = 300;
let body = '';
opts.forEach(([n, a, b], i) => {
  for (const [row, bg, s] of [[0, 'oklch(96.5% 0.015 75)', 0.42], [1, 'oklch(21% 0.012 60)', 0.42], [2, 'oklch(96.5% 0.015 75)', 0.085]]) {
    const x = i * cell, y = row * 300;
    body += `<rect x="${x}" y="${y}" width="${cell}" height="300" fill="${bg}"/>`;
    body += `<g style="--cd-beret:${a};--cd-beret-band:${b}" transform="translate(${x + cell / 2} ${y + 270}) scale(${s}) translate(-350 -700)">${figure('c' + i + row, {})}</g>`;
    if (row === 0) body += `<text x="${x + 12}" y="${y + 24}" font-size="18" font-family="PingFang TC">${n}</text>`;
  }
});
writeFileSync('checks/beret-colours.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cell * opts.length} 900">${defs()}${body}</svg>`);

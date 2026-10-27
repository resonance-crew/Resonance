// torso-alt (the card written full) with the face slid to its limits (±12 each way) and the reveal pose the stage
// uses (face −3 up, +4 right): the writing must stay clear of the eyes, cheeks and mouth. → checks/alt-slide.svg
import { writeFileSync } from 'node:fs';
import { defs } from '../gen/card.mjs';
import { figure } from '../gen/figure.mjs';
const poses = [[0, 0], [-12, 0], [12, 0], [0, -12], [0, 12], [4, -3]];
let b = '';
poses.forEach(([x, y], i) => {
  const gx = 20 + (i % 3) * 330, gy = 10 + Math.floor(i / 3) * 260;
  b += `<g transform="translate(${gx} ${gy}) scale(0.75) translate(-130 -320)">${figure('as' + i + '-', { alt: true, face: [x, y], shadow: false })}</g>`;
  b += `<text x="${gx + 10}" y="${gy + 250}" font-size="14" font-family="sans-serif">face ${x}, ${y}</text>`;
});
writeFileSync('checks/alt-slide.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 530">${defs()}<rect width="1000" height="530" fill="#faf2e9"/>${b}</svg>`);

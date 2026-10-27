import { readFileSync, writeFileSync } from 'node:fs';
const strip = f => readFileSync(f, 'utf8').replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const crop = '255 385 190 90';
const cell = (x, src, bg) => `<rect x="${x}" y="0" width="570" height="270" fill="${bg}"/><svg x="${x}" y="0" width="570" height="270" viewBox="${crop}">${strip(src)}</svg>`;
writeFileSync('work/r3/face.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="560">${cell(0, 'v1/rig.svg', '#f8f2ea')}${cell(590, 'rig.svg', '#f8f2ea')}
<g transform="translate(0 290)">${cell(0, 'v1/rig.svg', 'rgb(29,23,19)')}${cell(590, 'rig.svg', 'rgb(29,23,19)')}</g></svg>`);

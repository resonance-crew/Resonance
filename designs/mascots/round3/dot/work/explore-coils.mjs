// work/explore-coils.mjs: candidate curl arrangements, rest pose, at 160 px colour, 48 px colour and 48 px silhouette
import { writeFileSync } from 'node:fs';
import { defs, figure, P } from '../gen/dot.mjs';
const V = {
  A: P.coils.map(c => ({ ...c })),
  // tighter cluster, big coil a bit smaller, the medium tucked against it
  B: [
    { c: [374, 482], r0: 8, r1: 3.2, a0: 75, a1: -250, w0: 7.5, w1: 6, seed: 303 },
    { c: [349, 474], r0: 12.5, r1: 4, a0: 70, a1: -310, w0: 8.5, w1: 6.5, seed: 302 },
    { c: [323, 474], r0: 18, r1: 5.5, a0: 55, a1: -380, w0: 10, w1: 7, seed: 301 },
  ],
  // the critic's literal transform of the first pass: down 12, then −10° about the new pivot
  C: (() => { const th = -10 * Math.PI / 180, [px, py] = [350, 486];
    return [[377, 477, 9, 3.5, 75, -250, 7.5, 6, 303], [354, 465, 13.5, 4, 70, -310, 8.5, 6.5, 302], [326, 456, 20.5, 5.5, 55, -380, 10, 7, 301]].map(([x, y, r0, r1, a0, a1, w0, w1, seed]) => {
      const dx = x - px, dy = y + 12 - py; return { c: [px + dx * Math.cos(th) - dy * Math.sin(th), py + dx * Math.sin(th) + dy * Math.cos(th)], r0, r1, a0: a0 - 10, a1: a1 - 10, w0, w1, seed }; }); })(),
  // more turns (a rolled strip, not a letter), the three overlapping into one tuft
  E: [
    { c: [377, 486], r0: 9, r1: 2.6, a0: 80, a1: -560, w0: 6, w1: 4.6, seed: 303 },
    { c: [353, 477], r0: 13.5, r1: 3, a0: 75, a1: -620, w0: 6.8, w1: 5, seed: 302 },
    { c: [322, 476], r0: 20, r1: 3.6, a0: 60, a1: -700, w0: 8, w1: 5.4, seed: 301 },
  ],
  F: [
    { c: [376, 487], r0: 8.5, r1: 2.8, a0: 80, a1: -470, w0: 6.5, w1: 5, seed: 303 },
    { c: [351, 478], r0: 13, r1: 3.2, a0: 75, a1: -520, w0: 7.5, w1: 5.5, seed: 302 },
    { c: [322, 477], r0: 19.5, r1: 4, a0: 60, a1: -600, w0: 8.6, w1: 6, seed: 301 },
  ],
  // lower still: the big coil more on the forehead than above it
  D: [
    { c: [375, 486], r0: 8.5, r1: 3.3, a0: 75, a1: -250, w0: 7.5, w1: 6, seed: 303 },
    { c: [351, 478], r0: 13, r1: 4, a0: 70, a1: -310, w0: 8.5, w1: 6.5, seed: 302 },
    { c: [321, 479], r0: 19.5, r1: 5.5, a0: 55, a1: -380, w0: 10, w1: 7, seed: 301 },
  ],
};
const W = 180;
const ZOOM = process.argv.includes('--zoom');
const keys = Object.keys(V);
let body = '', uses = '';
keys.forEach((k, i) => {
  P.coils = V[k];
  uses += `<g id="v${k}">${figure('dt-x' + k + '-', {})}</g>`;
  const x = i * W;
  const at = (h, y, sil) => { const s = h / 270; return `<g transform="translate(${x + 90} ${y}) scale(${s}) translate(-350 -700)"${sil ? ' filter="url(#sil)"' : ''}><use href="#v${k}"/></g>`; };
  const label = `<text x="${x + 10}" y="20" font-size="14" font-family="sans-serif">${k}</text>`;
  body += (ZOOM ? `<g transform="translate(${x + 90} 130) scale(1.25) translate(-350 -490)"><use href="#v${k}"/></g><rect x="${x}" y="230" width="${W}" height="120" fill="#faf2e9"/>${at(48, 300)}${at(48, 345, true)}` : `${at(160, 190)}${at(48, 260)}${at(48, 330, true)}`) + label;
});
writeFileSync('work/explore-coils.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * keys.length} 350" width="${W * keys.length}" height="350">${defs()}
<defs>${uses}<filter id="sil" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter></defs>
<rect width="100%" height="100%" fill="#faf2e9"/>${body}</svg>`);
console.log(JSON.stringify(V.C.map(c => c.c.map(v => +v.toFixed(1)))));

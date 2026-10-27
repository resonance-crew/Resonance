// Exploration only: three head-decoration candidates on the rest pose, big and at 96/48 px, with silhouettes.
import { writeFileSync } from 'node:fs';
import * as T from './tk.mjs';
import { spline, tear, path, pencil } from './lib.mjs';
const F = 'tk-';
const fillC = c => `style="fill:${c}"`;
// a tapered lock along a spine through control points, pointed at the tip
function lock(ctrl, w0, seed, tipW = 1.5) {
  const sp = spline(ctrl, 3, false);
  const n = sp.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = i / (n - 1), w = (w0 * Math.pow(1 - t, 0.75) + tipW * t) / 2;
    L.push([sp[i][0] - ty * w, sp[i][1] + tx * w]); Rr.push([sp[i][0] + ty * w, sp[i][1] - tx * w]);
  }
  return tear([...L, ...Rr.reverse()], seed, { jag: 0.45, wander: 1.2 });
}
const gem = 'M-5,2 L12,2 A2,2 0 0 0 12,-2 L-17,-2 A4,4 0 0 0 -17,6 L18,6 A6,6 0 0 0 18,-6 L-8,-6';
const clip = (cx, cy, ang, sc = 1.2) => `<g transform="translate(${cx} ${cy}) rotate(${ang}) scale(${sc})" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="${gem}" stroke="oklch(28% 0.03 55)" stroke-width="3.2" opacity="0.28" transform="translate(1 1.8)" filter="url(#${F}crayon-soft)"/>
  <g filter="url(#${F}metal)"><path d="${gem}" stroke="${T.C.brassDeep}" stroke-width="3.6"/><path d="${gem}" stroke="${T.C.brass}" stroke-width="2.2"/></g>
  <path d="${gem}" stroke="${T.C.brassHi}" stroke-width="0.7" opacity="0.75" transform="translate(-0.4 -0.5)"/></g>`;
const H = T.C.hair, HL = T.C.hairLight;
const locks = (defs) => defs.map(([c, w, k, s]) => `<path d="${path(lock(c, w, s))}" ${fillC(k)} filter="url(#${F}thin)"/>`).join('');
const V = {
  quiff: locks([
    [[[338, 296], [330, 264], [306, 246], [276, 250]], 24, HL, 61],
    [[[350, 294], [346, 254], [322, 228], [288, 222]], 28, H, 62],
    [[[362, 292], [366, 258], [352, 232], [328, 220]], 22, HL, 63],
  ]) + clip(352, 290, -6),
  fringe: locks([
    [[[392, 262], [350, 262], [304, 282], [276, 318], [266, 350]], 30, HL, 64],
    [[[386, 270], [344, 272], [306, 296], [286, 330]], 28, H, 65],
    [[[380, 278], [346, 284], [318, 306], [304, 336]], 22, HL, 66],
  ]) + clip(374, 270, -168),
  topknot: locks([
    [[[372, 270], [366, 238], [340, 218], [312, 222], [300, 236]], 26, H, 67],
    [[[384, 270], [394, 236], [420, 222], [440, 230]], 22, HL, 68],
    [[[378, 272], [376, 236], [372, 210]], 18, HL, 69],
  ]) + clip(378, 268, -4),
};
const fig = (deco, I) => `<g>${T.shadow()}${T.leg('l')}${T.leg('r')}${T.arm(I, 'l', T.REST.armL)}${T.arm(I, 'r', T.REST.armR)}${T.torso(I)}${deco}${T.cheeks()}${T.eye('l')}${T.eye('r')}${T.mouth()}</g>`;
const SIL = `<filter id="sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
let body = '', x = 0;
const names = Object.keys(V);
let defsUse = '';
names.forEach((k, i) => { defsUse += `<g id="v-${k}">${fig(V[k], 'e' + i + '-')}</g>`; });
const place = (k, cx, cy, h, sil) => `<g transform="translate(${cx} ${cy}) scale(${h / 480}) translate(-405 -450)"><use href="#v-${k}"${sil ? ' filter="url(#sil)"' : ''}/></g>`;
names.forEach((k, i) => {
  const X = 230 + i * 470;
  body += place(k, X, 300, 470) + place(k, X - 110, 680, 96) + place(k, X - 10, 680, 48) + place(k, X + 80, 680, 96, true) + place(k, X + 170, 680, 48, true);
  body += `<text x="${X}" y="780" font-size="22" text-anchor="middle" font-family="sans-serif" fill="#555">${k}</text>`;
});
writeFileSync('work/explore-deco.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1410 800" width="1410" height="800">${T.defs()}<defs>${SIL}</defs><defs><g>${''}</g></defs><g visibility="hidden">${defsUse}</g><rect width="1410" height="800" fill="oklch(96.5% 0.015 75)"/>${body}</svg>`);

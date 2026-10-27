// node work/r3/px.mjs → work/r3/px.svg: v1 and now at 120, 88, 48 px on both papers (true size), for a pixel zoom
import { writeFileSync } from 'node:fs';
const A = { rig: await import('../../v1/gen/rig.mjs'), h: await import('../../v1/gen/hush.mjs') };
const B = { rig: await import('../../gen/rig.mjs'), h: await import('../../gen/hush.mjs') };
const ns = (s, p) => s.replace(/id="nt-/g, `id="${p}nt-`).replace(/url\(#nt-/g, `url(#${p}nt-`);
const at = (x, base, h, inner) => { const s = h / 404; return `<g transform="translate(${(x - 350 * s).toFixed(1)} ${(base - 702 * s).toFixed(1)}) scale(${s.toFixed(4)})">${inner}</g>`; };
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="300"><defs>${ns(A.h.defs(), 'a-')}${ns(B.h.defs(), 'b-')}</defs>
<rect width="720" height="150" fill="oklch(96.5% 0.015 75)"/><rect y="150" width="720" height="150" fill="oklch(21% 0.012 60)"/>`;
[['a', A, 0], ['b', B, 360]].forEach(([p, M, x0]) => {
  const d = ns(M.rig.figure(p + 'd-', {}), p + '-'), n = ns(M.rig.figure(p + 'n-', { glow: true }), p + '-');
  s += at(x0 + 75, 140, 120, d) + at(x0 + 205, 140, 88, d) + at(x0 + 300, 140, 48, d);
  s += at(x0 + 75, 290, 120, n) + at(x0 + 205, 290, 88, n) + at(x0 + 300, 290, 48, n);
});
writeFileSync('work/r3/px.svg', s + '</svg>');

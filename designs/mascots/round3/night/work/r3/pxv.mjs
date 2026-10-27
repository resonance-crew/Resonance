// node work/r3/pxv.mjs '<json list of G overrides>' → work/r3/pxv.svg: variants at 120 / 48 px on both papers
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const vs = JSON.parse(process.argv[2]);
const figs = vs.map((v, i) => JSON.parse(execFileSync('node', ['--input-type=module', '-e', `
  const m = await import('${process.cwd()}/gen/rig.mjs'); const h = await import('${process.cwd()}/gen/hush.mjs');
  process.stdout.write(JSON.stringify({ defs: h.defs(), d: m.figure('d${i}-', {}), n: m.figure('n${i}-', { glow: true }) }));`], { env: { ...process.env, NT_G: JSON.stringify(v) } }).toString()));
const ns = (s, p) => s.replace(/id="nt-/g, `id="${p}nt-`).replace(/url\(#nt-/g, `url(#${p}nt-`);
const at = (x, base, h, inner) => { const s = h / 404; return `<g transform="translate(${(x - 350 * s).toFixed(1)} ${(base - 702 * s).toFixed(1)}) scale(${s.toFixed(4)})">${inner}</g>`; };
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${vs.length * 220}" height="300"><defs>${figs.map((f, i) => ns(f.defs, `v${i}-`)).join('')}</defs>
<rect width="100%" height="150" fill="oklch(96.5% 0.015 75)"/><rect y="150" width="100%" height="150" fill="oklch(21% 0.012 60)"/>`;
figs.forEach((f, i) => { const x0 = i * 220; s += at(x0 + 75, 140, 120, ns(f.d, `v${i}-`)) + at(x0 + 180, 140, 48, ns(f.d, `v${i}-`)) + at(x0 + 75, 290, 120, ns(f.n, `v${i}-`)) + at(x0 + 180, 290, 48, ns(f.n, `v${i}-`)); });
writeFileSync('work/r3/pxv.svg', s + '</svg>');

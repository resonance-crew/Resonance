// work/r3/variants.mjs <out.svg> '<json list of G overrides>' — rest figures per variant: the crown at 3×, the whole at 120 / 48 px, silhouettes
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [,, out, list, labels = ''] = process.argv;
const vs = JSON.parse(list);
const names = labels ? labels.split('|') : vs.map((_, i) => 'v' + i);
const figs = vs.map((v, i) => execFileSync('node', ['--input-type=module', '-e', `
  const m = await import('${process.cwd()}/gen/rig.mjs'); const h = await import('${process.cwd()}/gen/hush.mjs');
  const o = ${JSON.stringify(v.pose || {})};
  process.stdout.write(JSON.stringify({ defs: h.defs(), fig: m.figure('v${i}-', o) }));`], { env: { ...process.env, NT_G: JSON.stringify(v.G || {}) } }).toString()).map(s => JSON.parse(s));
const sil = `<filter id="zsil" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
const CW = 360, ROWH = [270, 150, 150];
const crown = process.env.CROWN ? JSON.parse(process.env.CROWN) : [370, 290, 120, 90];
let body = '';
figs.forEach(({ fig }, i) => {
  const x0 = i * (CW + 16);
  const vb = (b, w, h, f = '', bg = '#f8f2ea', y = 0) => `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="${bg}"/><svg x="${x0}" y="${y}" width="${w}" height="${h}" viewBox="${b.join(' ')}" overflow="hidden"><g${f}>${fig}</g></svg>`;
  body += vb(crown, CW, 270);
  // whole figure 120 px and 48 px on day and night
  const whole = [120, 290, 460, 420];
  const at = (y, hpx, bg, f = '', dx = 0) => { const w = hpx * 460 / 420; return `<rect x="${x0 + dx}" y="${y}" width="${w}" height="${hpx * 1.02}" fill="${bg}"/><svg x="${x0 + dx}" y="${y}" width="${w}" height="${hpx}" viewBox="${whole.join(' ')}"><g${f}>${fig}</g></svg>`; };
  body += at(280, 120, '#f8f2ea') + at(280, 120, 'rgb(29,23,19)', '', 135) + at(280, 48, '#f8f2ea', '', 270) + at(340, 48, 'rgb(29,23,19)', '', 270);
  body += at(410, 120, '#fff', ' filter="url(#zsil)"') + at(410, 48, '#fff', ' filter="url(#zsil)"', 135) + at(470, 48, '#fff', ' filter="url(#zsil)"', 200);
  body += `<text x="${x0 + 4}" y="560" font-size="14" font-family="sans-serif" fill="#333">${names[i]}</text>`;
});
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${figs.length * (CW + 16)}" height="570"><defs>${figs[0].defs}${sil}</defs><rect width="100%" height="100%" fill="#ddd"/>${body}</svg>`);

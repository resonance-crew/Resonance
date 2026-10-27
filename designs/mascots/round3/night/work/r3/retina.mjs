// work/r3/retina.mjs <out.svg> '<json variants>' 'labels' — each variant: a crop at 3×, then rest at 120 CSS px and 48 CSS px
// shown at 2× (what a retina screen draws), on the day and night papers, plus the 48 px silhouette
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [,, out, list, labels = ''] = process.argv;
const vs = JSON.parse(list);
const names = labels ? labels.split('|') : vs.map((_, i) => 'v' + i);
const figs = vs.map((v, i) => JSON.parse(execFileSync('node', ['--input-type=module', '-e', `
  const m = await import('${process.cwd()}/${v.dir || 'gen'}/rig.mjs'); const h = await import('${process.cwd()}/${v.dir || 'gen'}/hush.mjs');
  process.stdout.write(JSON.stringify({ defs: h.defs(), fig: m.figure('v${i}-', ${JSON.stringify(v.pose || {})}) }));`], { env: { ...process.env, NT_G: JSON.stringify(v.G || {}), NT_C: JSON.stringify(v.C || {}) } }).toString()));
const sil = `<filter id="zsil" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
const crop = process.env.CROP ? JSON.parse(process.env.CROP) : [100, 450, 160, 150];
const whole = [100, 280, 500, 430];   // ≈ crown 298 … soles 702
const CW = 520; let body = '';
figs.forEach(({ fig: fig0 }, i) => { let fig = fig0;
  const x0 = i * (CW + 14);
  const tile = (x, y, w, h, vb, bg, f = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.join(' ')}" overflow="hidden"><g${f}>${fig}</g></svg>`;
  const cw = 260, ch = cw * crop[3] / crop[2];
  body += `<defs>${figs[i].defs.replace(/id="nt-/g, `id="nt${i}-`).replace(/<defs>|<\/defs>/g, '')}</defs>`; fig = fig.replace(/url\(#nt-/g, `url(#nt${i}-`);
  body += tile(x0, 0, cw, ch, crop, '#f8f2ea') + tile(x0 + cw + 4, 0, cw - 4, ch, crop, 'rgb(29,23,19)');
  const h120 = 240 * 430 / 404, w120 = h120 * 500 / 430;   // 120 CSS px tall figure at dpr 2
  const y1 = ch + 10;
  body += tile(x0, y1, w120, h120, whole, '#f8f2ea') + tile(x0 + w120 + 4, y1, w120, h120, whole, 'rgb(29,23,19)');
  const h48 = 96 * 430 / 404, w48 = h48 * 500 / 430, y2 = y1 + h120 + 8;
  body += tile(x0, y2, w48, h48, whole, '#f8f2ea') + tile(x0 + w48 + 4, y2, w48, h48, whole, 'rgb(29,23,19)') + tile(x0 + 2 * w48 + 8, y2, w48, h48, whole, '#fff', ' filter="url(#zsil)"');
  body += `<text x="${x0 + 3 * w48 + 20}" y="${y2 + 30}" font-size="15" font-family="sans-serif" fill="#222">${names[i]}</text>`;
});
const H = 260 * crop[3] / crop[2] + 10 + 240 * 430 / 404 + 8 + 96 * 430 / 404 + 6;
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${figs.length * (CW + 14)}" height="${Math.ceil(H)}"><defs>${figs[0].defs}${sil}</defs><rect width="100%" height="100%" fill="#ccc"/>${body}</svg>`);
console.log(figs.length * (CW + 14), Math.ceil(H));

// work/r3/zoom.mjs <out.svg> — close-ups for the review pass: v1 vs now, the crown at 3×, plus silhouettes
import { readFileSync, writeFileSync } from 'node:fs';
const [,, out, which = 'crown'] = process.argv;
const strip = f => readFileSync(f, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const v1 = strip('v1/rig.svg').replace(/display="none"/g, 'display="none"');
const now = strip('rig.svg');
const sil = `<filter id="zsil" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
const box = which === 'crown' ? [360, 280, 160, 120] : which === 'arm' ? [120, 420, 160, 180] : [130, 270, 440, 450];
const [bx, by, bw, bh] = box, S = which === 'all' ? 1.2 : 3;
const cell = (x, y, inner, bg, filt = '') => `<g transform="translate(${x} ${y})"><rect width="${bw * S}" height="${bh * S}" fill="${bg}"/><svg x="0" y="0" width="${bw * S}" height="${bh * S}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="hidden"><g${filt}>${inner}</g></svg></g>`;
const W = bw * S, H = bh * S;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 3 + 40}" height="${H * 2 + 30}" viewBox="0 0 ${W * 3 + 40} ${H * 2 + 30}"><defs>${sil}</defs>
${cell(0, 0, v1, '#f8f2ea')}${cell(W + 20, 0, now, '#f8f2ea')}${cell(2 * W + 40, 0, now, 'rgb(29,23,19)')}
${cell(0, H + 30, v1, '#fff', ' filter="url(#zsil)"')}${cell(W + 20, H + 30, now, '#fff', ' filter="url(#zsil)"')}
</svg>`;
writeFileSync(out, svg);

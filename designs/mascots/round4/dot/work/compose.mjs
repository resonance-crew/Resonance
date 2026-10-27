// Shared bits for the round-4 sheets: Pip composed from exported parts exactly as the stage engine composes it at rest
// (one <img> per part at its manifest box, scaled by k = px per rig unit), the stage sizes, the papers.
import { readFileSync } from 'node:fs';
export const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
export const INK = '#3a2f27', MUTED = '#7a6c60', NIGHT_INK = '#e8dccf', NIGHT_MUTED = '#b8aa9c', ACCENT = 'oklch(62% 0.14 45)';
export const HEIGHT = 231;
// stage height = unitHeight × (rig height / 420) ^ 0.75 (mascot-stage.js scaleBy, heightCurve 0.75)
export const stageK = unit => unit * (HEIGHT / 420) ** 0.75 / HEIGHT;
export const SIZES = [
  { key: 'desktop', label: '桌機', unit: 120 },
  { key: 'tablet', label: '平板', unit: 100 },
  { key: 'phone', label: '手機', unit: 80 },
  { key: 'tiny', label: '48 px', px: 48 },
].map(s => ({ ...s, k: s.px ? s.px / HEIGHT : stageK(s.unit) }));
for (const s of SIZES) s.px = s.px ?? Math.round(s.k * HEIGHT);
export const manifest = dir => JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
// the character at rest, its ground point (350,700 in rig units) at (gx, gy); dim = the stage's night dimming
export function pip(dir, k, gx, gy, { dim = false } = {}) {
  const m = manifest(dir);
  const ox = gx - m.ground[0] * k, oy = gy - m.ground[1] * k;
  const filt = dim ? 'filter:brightness(0.9) saturate(0.92);' : '';
  return m.parts.filter(p => p.w && !p.variantOf && !p.only).sort((a, b) => a.z - b.z).map(p =>
    `<img src="${dir}/${p.img}" style="position:absolute;left:${(ox + p.x * k).toFixed(2)}px;top:${(oy + p.y * k).toFixed(2)}px;width:${(p.w * k).toFixed(2)}px;height:${(p.h * k).toFixed(2)}px;${filt}">`).join('');
}
// a rig.svg inlined with its ids renamed, placed so that rig unit (ux, uy) lands at (x, y) with k px per unit
export const inlineRig = (file, pre, k, ux, uy, x, y) => readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/id="dt-/g, `id="${pre}`).replace(/url\(#dt-/g, `url(#${pre}`)
  .replace(/<svg([^>]*) width="700" height="760">/, `<svg$1 style="position:absolute;left:${(x - ux * k).toFixed(1)}px;top:${(y - uy * k).toFixed(1)}px;width:${(700 * k).toFixed(1)}px;height:${(760 * k).toFixed(1)}px">`);
export const font = `font-family:'PingFang TC','Noto Sans TC',sans-serif`;
export const box = (x, y, w, h, inner, style = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;${style}">${inner}</div>`;
export const text = (x, y, t, { size = 13, color = INK, w = 400, weight = 400, extra = '' } = {}) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;line-height:1.4;color:${color};font-weight:${weight};${extra}">${t}</div>`;
// the four stage sizes side by side on one paper, feet on one ground line
export function sizesRow(dir, x, y, w, h, bg, dim, labelColor) {
  let s = '', cx = 18;
  for (const z of SIZES) {
    const halfW = 128 * z.k;          // the rest pose spans about 222–478 units across
    cx += halfW;
    s += pip(dir, z.k, cx, h - 30, { dim });
    s += text(cx - 30, h - 24, `${z.label}<br>${z.px} px`, { size: 10.5, color: labelColor, w: 60, extra: 'text-align:center;line-height:1.2' });
    cx += halfW + 16;
  }
  return box(x, y, w, h, s, `background:${bg}`);
}
// the landing captures (stage/…/r3/landing): phone 2× (390 CSS wide), desktop 1× (1440 wide)
const L = '../../../landing/';
export function phoneHero(dir, x, y, w, h, dark) {
  const k = stageK(80), gx = 252, gy = 357;       // standing on the headline's top, over the peach blob
  const cx = gx - w / 2, cy = gy - h + 18;
  return box(x, y, w, h, `<img src="${L}mobile-${dark ? 'dark' : 'light'}.png" style="position:absolute;left:${-cx}px;top:${-cy}px;width:390px">` +
    pip(dir, k, gx - cx, gy - cy, { dim: dark }));
}
export function desktopRow(dir, x, y, w, h, dark) {
  const k = stageK(120), gx = 566, gy = 738;      // at the front of the early storytellers' avatar row
  const cx = gx - w / 2 + 20, cy = gy - h + 22;
  return box(x, y, w, h, `<img src="${L}desktop-${dark ? 'dark' : 'light'}.png" style="position:absolute;left:${-cx}px;top:${-cy}px;width:1440px">` +
    pip(dir, k, gx - cx, gy - cy, { dim: dark }));
}

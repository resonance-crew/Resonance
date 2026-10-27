// Composing a character from its exported parts the way the stage engine does (mascot-stage.js: one <img> per part,
// placed in rig units × k, k = stage height / data-height; the night page dims every part but stars-glow with
// brightness(0.9) saturate(0.92)); and close-ups from the rig itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

export const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', BODY = 'oklch(43.5% 0.062 260)';
export const INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(46% 0.03 60)', TERRA = 'oklch(62% 0.14 45)';
export const FONT = `'PingFang TC','Noto Sans TC',sans-serif`;
// stage heights: unit × (rig height / 420)^0.75 — 悄悄's rig is 400 tall
export const curve = unit => unit * (400 / 420) ** 0.75;
export const SIZES = [['桌機', curve(120)], ['平板', curve(100)], ['手機', curve(80)], ['48 px', 48]];

// the figure box in rig units (crown of the crescent to the shadow, mittens included)
const BOX = { x0: 138, x1: 562, y0: 284, y1: 718 };

// state: 'open' | 'sleepy' | 'shut' | 'nap'
export function figure(partsDir, h, { theme = 'light', state = 'open', mouth = 'mouth' } = {}) {
  const m = JSON.parse(readFileSync(join(partsDir, 'manifest.json'), 'utf8'));
  const k = h / m.height;
  const showEye = state === 'open' ? null : state;
  const visible = p => {
    if (!p.w) return false;
    if (p.only === 'dark') return theme === 'dark';
    if (p.name === 'eye-l' || p.name === 'eye-r') return !showEye;
    if (p.variantOf === 'eye-l' || p.variantOf === 'eye-r') return p.name.endsWith('-' + showEye);
    if (p.variantOf === 'mouth') return p.name === mouth;
    if (p.name === 'mouth') return mouth === 'mouth';
    if (p.variantOf) return false;
    return true;
  };
  const imgs = m.parts.filter(visible).sort((a, b) => a.z - b.z).map(p =>
    `<img src="file://${join(partsDir, p.img)}" class="${p.only === 'dark' ? 'glow' : ''}" style="position:absolute;left:${((p.x - BOX.x0) * k).toFixed(2)}px;top:${((p.y - BOX.y0) * k).toFixed(2)}px;width:${(p.w * k).toFixed(2)}px;height:${(p.h * k).toFixed(2)}px">`).join('');
  return `<div class="fig ${theme === 'dark' ? 'dim' : ''}" style="position:relative;flex:none;width:${((BOX.x1 - BOX.x0) * k).toFixed(1)}px;height:${((BOX.y1 - BOX.y0) * k).toFixed(1)}px">${imgs}</div>`;
}

// a close-up of the face from the rig (vector), with the eye state switched on; written as a standalone SVG image
export function closeup(rigPath, outDir, tag, state, { w = 380, scale = 2, crop = [252, 388, 196, 76] } = {}) {
  let t = readFileSync(rigPath, 'utf8').replace('<g data-rig ', '<g data-rig="" ');
  if (state !== 'open') {
    t = t.replace(/(data-part="eye-[lr]" [^>]*?)>/g, '$1 display="none">')
      .replace(new RegExp(`(data-part="eye-[lr]-${state}" [^>]*?) display="none"`, 'g'), '$1');
  }
  const [cx, cy, cw, ch] = crop;
  t = t.replace(/viewBox="[^"]+" width="\d+" height="\d+"/, `viewBox="${cx} ${cy} ${cw} ${ch}" width="${cw * scale}" height="${ch * scale}"`);
  mkdirSync(outDir, { recursive: true });
  const f = resolve(outDir, `${tag}-${state}.svg`); writeFileSync(f, t);
  return `<img src="file://${f}" style="display:block;width:${cw * scale}px;height:${ch * scale}px;border-radius:6px">`;
}
export const CSS = `*{box-sizing:border-box}body{margin:0;background:oklch(98% 0.006 80);font-family:${FONT};color:${INK}}
.fig.dim img{filter:brightness(.9) saturate(.92)}.fig.dim img.glow{filter:none}
.panel{display:flex;align-items:flex-end;gap:14px;padding:10px 14px 8px;border-radius:8px}
.cap{font-size:11px;color:${MUTED};text-align:center;margin-top:3px}.night .cap{color:oklch(72% 0.01 60)}`;

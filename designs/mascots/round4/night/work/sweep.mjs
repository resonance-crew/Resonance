// node work/r4/sweep.mjs → work/r4/sweep.png: quick parameter sweep of eye treatments, direct rig renders
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../../kit/cdp.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const base = { k: [0.72, 0.72], off: [0, 0], glint: [3.2, 3.4], lid: 0.12, w: 2.6, ring: 0 };
const V = JSON.parse(process.env.SWEEP || 'null') || [
  ['v3 現在', { style: 'cream' }],
  ['A .72', { style: 'pupil' }],
  ['A .78', { style: 'pupil', k: [0.78, 0.78] }],
  ['A .66', { style: 'pupil', k: [0.66, 0.66] }],
  ['B 低內 .72', { style: 'pupil', off: [0.1, 0.18] }],
  ['B 低 .70', { style: 'pupil', k: [0.7, 0.7], off: [0.06, 0.26] }],
  ['C 細邊 .82', { style: 'rim', k: [0.8, 0.8], w: 2.6 }],
  ['C 細邊 .76 w3.2', { style: 'rim', k: [0.76, 0.76], w: 3.2 }],
  ['D 夜藍瞳 .74', { style: 'pupil', k: [0.74, 0.74] }, { pupil: 'oklch(24% 0.045 262)' }],
];
const out = [];
V.forEach(([name, eye, col, geo], i) => {
  const f = resolve(HERE, `_sweep/${i}.svg`);
  execFileSync('node', [resolve(HERE, 'mkrig.mjs'), f], { cwd: ROOT, env: { ...process.env, NT_G: JSON.stringify({ eye: { ...base, ...eye }, ...(geo || {}) }), NT_C: JSON.stringify(col || {}) } });
  const t = readFileSync(f, 'utf8').replace('<g data-rig ', '<g data-rig="" ');
  writeFileSync(f, t);
  // the sleepy pair shown instead of the open eyes
  const fs2 = f.replace('.svg', '-s.svg');
  writeFileSync(fs2, t.replace(/(data-part="eye-[lr]" [^>]*?)>/g, '$1 display="none">').replace(/(data-part="eye-[lr]-sleepy" [^>]*?) display="none"/g, '$1'));
  out.push([name, f, fs2]);
});
const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
const sizes = [116, 96, 77, 48];
const fig = (f, h) => { const k = h / 400; return `<div style="position:relative;width:${(400 * k).toFixed(1)}px;height:${(430 * k).toFixed(1)}px;overflow:hidden;flex:none"><img src="${f}" style="position:absolute;left:${(-150 * k).toFixed(1)}px;top:${(-282 * k).toFixed(1)}px;width:${(700 * k).toFixed(1)}px"></div>`; };
const close = (f, bg) => `<div style="position:relative;width:${190 * 1.4}px;height:${80 * 1.4}px;overflow:hidden;background:${bg};flex:none"><img src="${f}" style="position:absolute;left:${-255 * 1.4}px;top:${-390 * 1.4}px;width:${700 * 1.4}px"></div>`;
const rows = out.map(([name, f, fs2]) => `<div style="display:flex;align-items:flex-end;gap:10px;margin:0 0 6px">
  <div style="width:110px;font:13px 'PingFang TC'">${name}</div>${close(f, NIGHT)}${close(fs2, DAY)}
  <div style="display:flex;align-items:flex-end;gap:8px;background:${DAY};padding:4px 8px">${sizes.map(h => fig(f, h)).join('')}</div>
  <div style="display:flex;align-items:flex-end;gap:8px;background:${NIGHT};padding:4px 8px;filter:none">${sizes.map(h => fig(f, h)).join('')}</div>
  <div style="display:flex;align-items:flex-end;gap:8px;background:${NIGHT};padding:4px 8px"><div style="display:flex;gap:8px;filter:brightness(.9) saturate(.92)">${sizes.map(h => fig(f, h)).join('')}</div></div></div>`).join('');
const html = `<!doctype html><meta charset=utf-8><body style="margin:10px;background:#fff">${rows}</body>`;
const hp = resolve(HERE, '_sweep/sweep.html'); writeFileSync(hp, html);
const b = await launch();
const p = await b.open('file://' + hp, { width: 1700, height: 160 * out.length, dpr: 2, wait: 800 });
await p.eval('new Promise(r => setTimeout(r, 1200))');
writeFileSync(resolve(HERE, process.env.OUT || 'sweep.png'), await p.shot({ full: true }));
await b.close();
console.log('ok');

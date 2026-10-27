// node work/r4/beforeafter.mjs → checks/r4-before-after.png: round 3 (v3/) beside round 4, the same scale; the stage
// sizes from each one's exported parts on both papers (night dimmed as the stage dims it), every eye state at desktop
// size, and close-ups of the four eye states from each rig
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../../kit/cdp.mjs';
import { figure, closeup, SIZES, DAY, NIGHT, CSS, MUTED, TERRA } from './compose.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const cu = resolve(HERE, '_closeups');
const STATES = [['open', '張眼 open'], ['sleepy', '想睡 sleepy'], ['shut', '開心 shut ∩'], ['nap', '睡著 nap ‿']];
const D = SIZES[0][1];
const cols = [
  { id: 'v3b', name: '第三輪（v3）', line: '暖奶油色塗實的橢圓，沒有瞳孔', rig: resolve(ROOT, 'v3/rig.svg'), parts: resolve(HERE, 'v3parts') },
  { id: 'now', name: '第四輪（現在）', line: '同一個暖白鉛筆眼，裡面放家族的深色豆瞳（占八成、稍微往下），一點反光', rig: resolve(ROOT, 'rig.svg'), parts: resolve(ROOT, 'parts') },
];
const sizes = (c, theme) => `<div class="panel ${theme === 'dark' ? 'night' : ''}" style="background:${theme === 'dark' ? NIGHT : DAY}">${SIZES.map(([lab, h]) =>
  `<div>${figure(c.parts, h, { theme })}<div class="cap">${lab}${lab.includes('px') ? '' : ' ' + Math.round(h)}</div></div>`).join('')}</div>`;
const states = (c, theme) => `<div class="panel ${theme === 'dark' ? 'night' : ''}" style="background:${theme === 'dark' ? NIGHT : DAY}">${STATES.map(([st, lab]) =>
  `<div>${figure(c.parts, D, { theme, state: st, mouth: st === 'sleepy' ? 'mouth' : 'mouth' })}<div class="cap">${lab}</div></div>`).join('')}</div>`;
const col = c => `<div class="col${c.id === 'now' ? ' now' : ''}">
  <div class="nm">${c.name}</div><div class="ln">${c.line}</div>
  <div class="h">近看（從骨架放大）：四種眼睛</div>
  <div class="cus">${STATES.map(([st, lab]) => `<div>${closeup(c.rig, cu, c.id, st, { scale: 1.75 })}<div class="cap">${lab}</div></div>`).join('')}</div>
  <div class="h">舞台大小（從匯出的部件組起來，2 倍裝置像素）：桌機 · 平板 · 手機 · 48 px</div>
  <div class="two">${sizes(c, 'light')}${sizes(c, 'dark')}</div>
  <div class="h">桌機大小（116 px），四種眼睛：日紙 · 夜紙（舞台壓暗）</div>
  <div class="two">${states(c, 'light')}${states(c, 'dark')}</div></div>`;
const html = `<!doctype html><meta charset=utf-8><style>${CSS}
body{padding:24px 28px;width:2010px}h1{font-size:26px;margin:0 0 4px}.sub{font-size:14px;color:${MUTED};margin:0 0 16px;line-height:1.5}
.cols{display:flex;gap:26px}.col{flex:1;padding:14px 16px;border-radius:12px;background:oklch(96% 0.008 80)}
.col.now{background:oklch(93% 0.035 60);outline:2px solid ${TERRA}}
.nm{font-size:20px;font-weight:600}.ln{font-size:13px;color:${MUTED};margin:2px 0 10px}.h{font-size:12.5px;color:${MUTED};margin:12px 0 5px}
.cus{display:grid;grid-template-columns:1fr 1fr;gap:8px}.two{display:flex;flex-direction:column;gap:8px}
.panel{justify-content:space-around}
</style><h1>悄悄 Hush · 第四輪前後對照：眼睛有了眼球</h1>
<div class="sub">左：第三輪（v3/，業主看過的那一版）；右：第四輪。同一個比例。舞台高 = 單位 ×（400 ÷ 420）<sup>0.75</sup>：桌機 116、平板 96、手機 77，另加 48 px。日紙 oklch(96.5% 0.015 75)；夜紙 oklch(21% 0.012 60)，照舞台把角色整層壓暗 brightness(0.9) saturate(0.92)、星光開著。<br>
只改了張眼（eye-l / eye-r）和想睡（eye-*-sleepy）；開心的 ∩ 和睡著的 ‿ 本來就是閉眼的白鉛筆弧線，沒有改。其他部件一像素都沒動。</div>
<div class="cols">${cols.map(col).join('')}</div>`;
const hp = resolve(HERE, '_ba.html'); writeFileSync(hp, html);
const b = await launch();
const p = await b.open('file://' + hp, { width: 2066, height: 1200, dpr: 2, wait: 600 });
await p.eval('Promise.all([...document.images].map(i => i.decode().catch(() => 0))).then(() => new Promise(r => setTimeout(r, 800)))');
const bad = await p.eval('[...document.images].filter(i => !i.naturalWidth).map(i => i.src).slice(0, 5)');
if (bad.length) console.log('BROKEN', bad);
const out = resolve(ROOT, 'checks/r4-before-after.png');
writeFileSync(out, await p.shot({ full: true }));
await b.close();
console.log('wrote', out);

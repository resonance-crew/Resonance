// node work/r4/sheet.mjs [pickId] → checks/r4-variants.png (each eye variant at the stage's real sizes, from its exported
// parts, on the day and the night paper at 2× device pixels, with a close-up from its rig; round 3's eyes beside them)
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../../kit/cdp.mjs';
import { VARIANTS } from './variants.mjs';
import { figure, closeup, SIZES, DAY, NIGHT, CSS, MUTED, TERRA } from './compose.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const pick = process.argv[2] || '';
const rows = [
  { id: 'v3', name: '第三輪（業主看過的）', line: '暖奶油色塗實的橢圓、一點反光，沒有瞳孔：業主說像眼神空洞、像幽靈', rig: resolve(ROOT, 'v3/rig.svg'), parts: resolve(HERE, 'v3parts') },
  ...VARIANTS.map(v => ({ ...v, rig: resolve(HERE, v.id, 'rig.svg'), parts: resolve(HERE, v.id, 'parts') })),
];
const cu = resolve(HERE, '_closeups');
const panel = (r, theme) => `<div class="panel ${theme === 'dark' ? 'night' : ''}" style="background:${theme === 'dark' ? NIGHT : DAY}">${SIZES.map(([lab, h]) =>
  `<div>${figure(r.parts, h, { theme })}<div class="cap">${lab}${lab.includes('px') ? '' : ' ' + Math.round(h)}</div></div>`).join('')}</div>`;
const row = r => `<div class="row${r.id === pick ? ' pick' : ''}">
  <div class="lab"><div class="nm">${r.name}${r.id === pick ? '<span class="tag">推薦</span>' : ''}</div><div class="ln">${r.line}</div></div>
  <div class="cu"><div>${closeup(r.rig, cu, r.id, 'open')}<div class="cap">張眼 eye-l / eye-r</div></div><div>${closeup(r.rig, cu, r.id, 'sleepy')}<div class="cap">想睡 eye-*-sleepy</div></div></div>
  ${panel(r, 'light')}${panel(r, 'dark')}</div>`;
const html = `<!doctype html><meta charset=utf-8><style>${CSS}
body{padding:26px 30px 20px;width:2050px}
h1{font-size:26px;margin:0 0 4px}.sub{font-size:14px;color:${MUTED};margin:0 0 18px;line-height:1.5}
.row{display:flex;align-items:center;gap:18px;padding:10px 12px;margin:0 -12px 6px;border-radius:12px;width:max-content}
.row.pick{background:oklch(93% 0.035 60);outline:2px solid ${TERRA}}
.lab{width:250px;flex:none}.nm{font-size:18px;font-weight:600;display:flex;align-items:center;gap:8px}.ln{font-size:13px;color:${MUTED};line-height:1.45;margin-top:4px}
.tag{font-size:13px;font-weight:600;color:#fff;background:${TERRA};border-radius:999px;padding:2px 10px}
.cu{display:flex;gap:10px}.heads{display:flex;gap:18px;font-size:13px;color:${MUTED};margin:0 0 4px 268px}
</style><h1>悄悄 Hush · 第四輪：給眼睛眼球</h1>
<div class="sub">每一種都從匯出的部件組起來，照舞台的做法排（k = 舞台高 ÷ 400），2 倍裝置像素。舞台高 = 單位 ×（400 ÷ 420）<sup>0.75</sup>：桌機 116（摺摺 120）、平板 96（摺摺約 100）、手機 77（摺摺 80），另加 48 px。<br>
左邊兩格是從骨架放大的近看（張眼、想睡）。日紙 oklch(96.5% 0.015 75)；夜紙 oklch(21% 0.012 60)，照舞台把角色整層壓暗 brightness(0.9) saturate(0.92)、星光開著。閉眼的 ∩（shut）和睡著的 ‿（nap）四種都不變。</div>
<div class="heads"><div style="width:770px">近看（從骨架放大）</div><div style="width:415px">日紙：桌機 · 平板 · 手機 · 48 px</div><div>夜紙（舞台壓暗）：同上</div></div>
${rows.map(row).join('')}
<div class="sub" style="margin-top:12px">${pick ? '推薦 A：保留了暖白鉛筆眼（大小、位置都不變），裡面是家族的深色豆豆眼加一點反光，所以「它自己」和「是一家人」兩件事都在；豆瞳占八成、只稍微往下，所以不會像嚇到。B 往下看、有點鬥雞眼；C 的一圈白邊像護目鏡、比較像被嚇到；D 眼睛變大，比家族的豆豆眼大了一號。' : ''}</div>`;
const hp = resolve(HERE, '_sheet.html'); writeFileSync(hp, html);
const b = await launch();
const p = await b.open('file://' + hp, { width: 2050, height: 1200, dpr: 2, wait: 600 });
await p.eval('Promise.all([...document.images].map(i => i.decode().catch(() => 0))).then(() => new Promise(r => setTimeout(r, 800)))');
const bad = await p.eval('[...document.images].filter(i => !i.naturalWidth).map(i => i.src).slice(0, 5)');
if (bad.length) console.log('BROKEN', bad);
const out = resolve(ROOT, 'checks/r4-variants.png');
writeFileSync(out, await p.shot({ full: true }));
await b.close();
console.log('wrote', out);

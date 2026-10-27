// work/stagecmp.mjs: v1 vs now at stage size (Tuck 120 px → 0.2857 px per rig unit) on the day paper, the hero's peach
// blob and the night paper, at 2× (what the owner's screen shows)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../kit/cdp.mjs';
const k = 120 / 420, W = 700 * k, H = 760 * k;
const bgs = [['日紙', 'rgb(250,242,233)'], ['桃色塊', 'rgb(249,229,213)'], ['夜紙', 'rgb(29,23,19)']];
const cell = (src, bg) => `<div style="background:${bg};width:${W.toFixed(1)}px;height:${(H * 0.42).toFixed(1)}px;overflow:hidden;position:relative"><img src="${src}" style="position:absolute;left:0;top:${(-H * 0.55).toFixed(1)}px;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px"></div>`;
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff;font:12px 'PingFang TC',sans-serif}td{padding:0 4px;text-align:center;vertical-align:top}</style>
<table cellspacing=0><tr>${bgs.map(([n]) => `<td colspan=2>${n}</td>`).join('')}</tr>
<tr>${bgs.map(() => '<td>第一版</td><td>修改後</td>').join('')}</tr>
<tr>${bgs.map(([, bg]) => `<td>${cell('../v1/parts/rest.png', bg)}</td><td>${cell('../parts/rest.png', bg)}</td>`).join('')}</tr></table>`;
const f = resolve('work/stagecmp.html'); writeFileSync(f, html);
const b = await launch(); const p = await b.open('file://' + f, { width: 6 * (W + 8), height: 120, dpr: 2, wait: 300 });
writeFileSync('work/stagecmp.png', await p.shot()); await b.close();

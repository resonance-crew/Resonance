// node quick.mjs out.png names…: close-ups (rig.svg, 1.3 px/unit) of each variant, plus 77/51 px rest renders from the svg
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../../kit/cdp.mjs';
const [out, ...names] = process.argv.slice(2);
const DAY = 'rgb(250,242,233)';
const inline = (file, pre, k, ux, uy, x, y) => readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/id="dt-/g, `id="${pre}`).replace(/url\(#dt-/g, `url(#${pre}`)
  .replace(/<svg([^>]*) width="700" height="760">/, `<svg$1 style="position:absolute;left:${(x - ux * k).toFixed(1)}px;top:${(y - uy * k).toFixed(1)}px;width:${(700 * k).toFixed(1)}px;height:${(760 * k).toFixed(1)}px">`);
const colW = 300, W = colW * names.length, H = 520;
let body = '';
names.forEach((n, i) => {
  const x0 = i * colW;
  body += `<div style="position:absolute;left:${x0 + 10}px;top:6px;font:14px sans-serif;color:#3a2f27">${n}</div>`;
  body += `<div style="position:absolute;left:${x0}px;top:30px;width:${colW}px;height:330px;overflow:hidden">${inline(`v/${n}/rig.svg`, `q${i}a-`, 1.3, 350, 580, colW / 2, 165)}</div>`;
  for (const [j, h] of [[0, 77], [1, 51]]) {
    const k = h / 231;
    body += inline(`v/${n}/rig.svg`, `q${i}${j}-`, k, 350, 700, x0 + 80 + j * 120, 480);
  }
});
const f = resolve('_quick.html');
writeFileSync(f, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:${DAY}}</style><div style="position:relative;width:${W}px;height:${H}px">${body}</div>`);
const b = await launch();
const p = await b.open('file://' + f, { width: W, height: H, dpr: 2, wait: 500 });
writeFileSync(out, await p.shot());
try { await b.close(); } catch {}
console.log('wrote', out);

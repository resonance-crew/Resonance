// node work/shot.mjs <in.svg> <out.png> <w> <h> [bg] [dpr]: render an SVG with the CDP helper (waits for paint)
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../kit/cdp.mjs';
const [inp, out, w, h, bg = '#f8f2ea', dpr = '1'] = process.argv.slice(2);
const html = resolve('work/_shot.html');
writeFileSync(html, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:${bg}}svg{display:block;width:${w}px;height:${h}px}</style>${readFileSync(inp, 'utf8')}`);
const b = await launch();
const p = await b.open('file://' + html, { width: +w, height: +h, dpr: +dpr, wait: 800 });
writeFileSync(out, await p.shot());
await b.close();
rmSync(html);
console.log('shot', out);

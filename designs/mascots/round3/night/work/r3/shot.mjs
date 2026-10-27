import { launch } from '../../../kit/cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [,, svg, out, w, h, dpr] = process.argv;
const b = await launch();
const html = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>html,body{margin:0;background:#fff}</style>${readFileSync(svg, 'utf8')}`)}`;
const p = await b.open(html, { width: +w, height: +h, dpr: +dpr, wait: 300 });
writeFileSync(out, await p.shot());
await b.close();

import { launch } from '../../kit/cdp.mjs';
import { writeFileSync } from 'node:fs';
const [,, url, out, w, h] = process.argv;
const b = await launch();
const p = await b.open(url, { width: +w, height: +h, transparent: true, wait: 400 });
writeFileSync(out, await p.shot({ clip: { x: 0, y: 0, width: +w, height: +h } }));
await b.close();

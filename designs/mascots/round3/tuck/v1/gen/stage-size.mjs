// node gen/stage-size.mjs (after the parts export) — checks/stage-size.png: parts/rest.png and the "hi" pose shrunk
// to the stage's sizes (120 px desktop, 88 px phone) and to 48 px, on the day and night papers, at 1×.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './tk.mjs';
import { FIG } from './concept.mjs';
import { launch } from '../../kit/cdp.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(ROOT, 'work'), { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">${T.defs()}<g transform="translate(300 300) scale(1.2) translate(${-FIG.cx} ${-FIG.cy})">${T.figure('tk-hb-', T.MAIN)}</g></svg>`;
writeFileSync(resolve(ROOT, 'work/_hb.html'), `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
const b = await launch();
const p = await b.open('file://' + resolve(ROOT, 'work/_hb.html'), { width: 600, height: 600, transparent: true, wait: 300 });
writeFileSync(resolve(ROOT, 'work/hi-big.png'), await p.shot({ clip: { x: 0, y: 0, width: 600, height: 600 } }));
await b.close();
execFileSync('python3', [resolve(ROOT, 'gen/stage-size.py')], { cwd: ROOT, stdio: 'inherit' });
console.log('wrote checks/stage-size.png');

// work/bbox.mjs: the bounding boxes (rig units, no filters) of the main and rest poses
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../kit/cdp.mjs';
import { defs, figure } from '../gen/dot.mjs';
import { MAIN } from '../gen/concept.mjs';
const f = resolve('work/bbox.html');
writeFileSync(f, `<!doctype html><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 760" width="700" height="760">${defs()}<g id="m">${figure('dt-bm-', MAIN)}</g><g id="r">${figure('dt-br-', {})}</g></svg>`);
const b = await launch(); const p = await b.open('file://' + f, { width: 700, height: 760 });
console.log(await p.eval(`JSON.stringify(['m','r'].map(id => { document.getElementById(id==='m'?'r':'m').style.display='none'; document.getElementById(id).style.display=''; const bb = document.getElementById(id).getBBox(); return [id, Math.round(bb.x), Math.round(bb.y), Math.round(bb.x+bb.width), Math.round(bb.y+bb.height)]; }))`));
await b.close();

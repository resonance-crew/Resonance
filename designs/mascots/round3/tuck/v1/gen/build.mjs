// node gen/build.mjs (run from the tuck folder or anywhere) — writes rig.svg and concept.svg from the same
// parameters (gen/tk.mjs), and the check sheets checks/*.svg. Render PNGs with ../../render.sh (see proposal.md).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './tk.mjs';
import { concept } from './concept.mjs';
import { sizes, measures, thumb, beforeAfter } from './checks.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(ROOT, 'checks'), { recursive: true });
writeFileSync(resolve(ROOT, 'rig.svg'), T.rig());
writeFileSync(resolve(ROOT, 'concept.svg'), concept());
writeFileSync(resolve(ROOT, 'checks/sizes.svg'), sizes());
writeFileSync(resolve(ROOT, 'checks/measures.svg'), measures());
writeFileSync(resolve(ROOT, 'checks/thumb.svg'), thumb());
writeFileSync(resolve(ROOT, 'checks/before-after.svg'), beforeAfter());
const r = p => p.map(v => Math.round(v));
console.log(JSON.stringify({ scale: +T.S.toFixed(4), sheetTop: +T.TOP.toFixed(1), mouthY: T.MOUTH_Y, shoulders: { l: r(T.SHOULDER.l), r: r(T.SHOULDER.r) },
  armD: T.ARM.D, mittenRest: { l: r(T.mittenAt('l', T.REST.armL)), r: r(T.mittenAt('r', T.REST.armR)) }, mittenHi: r(T.mittenAt('l', T.MAIN.armL)) }));

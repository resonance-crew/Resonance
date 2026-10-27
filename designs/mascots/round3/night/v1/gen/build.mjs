// node gen/build.mjs  (run from the character folder) → rig.svg and concept.svg, from the same parts.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rigSvg } from './rig.mjs';
import { conceptSvg } from './concept.mjs';
import { G, BRADS, edgeX } from './hush.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..');
writeFileSync(resolve(OUT, 'rig.svg'), rigSvg());
writeFileSync(resolve(OUT, 'concept.svg'), conceptSvg());
const insetL = BRADS.l[0] - edgeX(G.shoulderY, -1), insetR = edgeX(G.shoulderY, 1) - BRADS.r[0];
console.log(JSON.stringify({
  wrote: ['rig.svg', 'concept.svg'],
  brads: BRADS, bradInsetX: [insetL.toFixed(1), insetR.toFixed(1)], bradR: G.bradR,
  shoulderBelowMouth: G.shoulderY - G.mouth[1],
}));

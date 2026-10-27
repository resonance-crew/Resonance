// node gen/build.mjs (run from the character's folder): writes rig.svg and concept.svg from the shared parameters.
import { writeFileSync } from 'node:fs';
import { rigSvg } from './rig.mjs';
import { conceptSvg } from './concept.mjs';
writeFileSync('rig.svg', rigSvg());
writeFileSync('concept.svg', conceptSvg());
console.log('wrote rig.svg, concept.svg');

// node gen/build.mjs  (run from the tag folder) → rig.svg and concept.svg, from the same parameters (gen/tag.mjs).
import { writeFileSync } from 'node:fs';
import { rigSvg } from './rig.mjs';
import { conceptSvg } from './concept.mjs';

writeFileSync('rig.svg', rigSvg());
writeFileSync('concept.svg', conceptSvg());
console.log('wrote rig.svg, concept.svg');

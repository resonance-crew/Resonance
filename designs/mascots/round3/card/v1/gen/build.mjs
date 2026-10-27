// node gen/build.mjs (run from this folder): writes rig.svg and concept.svg from the same parts and numbers (card.mjs).
import { writeFileSync } from 'node:fs';
import { rigSvg } from './figure.mjs';
import { conceptSvg } from './concept.mjs';
writeFileSync('rig.svg', rigSvg());
writeFileSync('concept.svg', conceptSvg());
console.log('wrote rig.svg, concept.svg');

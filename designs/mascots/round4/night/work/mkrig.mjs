// node work/r4/mkrig.mjs <out.svg>   (NT_G / NT_C env pick the variant) → a rig.svg for that variant
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const { rigSvg } = await import('../../gen/rig.mjs');
const out = resolve(process.argv[2]); mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rigSvg());
console.log('wrote', out);

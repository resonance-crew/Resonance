// node mkrigs.mjs [names…]: writes v/<name>/rig.svg for each variant (run from work/r4)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { VARIANTS } from './variants.mjs';
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS);
for (const n of names) {
  mkdirSync(`v/${n}`, { recursive: true });
  const svg = execFileSync('node', ['-e', `import('./gen/rig.mjs').then(m => process.stdout.write(m.rigSvg()))`], { env: { ...process.env, DOT_VARIANT: JSON.stringify(VARIANTS[n]) } }).toString();
  writeFileSync(`v/${n}/rig.svg`, svg);
  console.log('wrote', `v/${n}/rig.svg`, svg.length);
}

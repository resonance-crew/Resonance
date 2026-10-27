// one variant per run: NT_G=… node work/bodies.mjs <i> <label>  → work/body-<i>.svg (main pose large, day + night, silhouettes)
import { writeFileSync } from 'node:fs';
import * as H from '../gen/hush.mjs';
import { figure } from '../gen/rig.mjs';
const [i, label] = process.argv.slice(2);
const fig = figure(`b${i}-`, { armL: -118, armR: 66, tilt: 2, face: [-3, -1] });
const rest = figure(`r${i}-`, {});
const night = figure(`n${i}-`, { glow: true });
writeFileSync(`work/body-${i}.svg`, `<g transform="translate(${i * 320} 0)"><rect width="320" height="440" fill="#f4ecdf"/><rect y="440" width="320" height="200" fill="oklch(21% 0.012 60)"/>
<g transform="translate(160 330) scale(0.72) translate(-350 -560)">${fig}</g>
<g transform="translate(40 410) scale(0.1) translate(-350 -560)" filter="url(#sil)">${fig}</g>
<g transform="translate(90 410) scale(0.1) translate(-350 -560)" filter="url(#sil)">${rest}</g>
<g transform="translate(140 410) scale(0.1) translate(-350 -560)">${rest}</g>
<g transform="translate(160 590) scale(0.36) translate(-350 -560)">${night}</g>
<text x="8" y="18" font-size="12">${label}</text></g>`);

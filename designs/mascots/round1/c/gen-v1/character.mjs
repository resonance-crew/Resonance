import { writeFileSync } from 'node:fs';
import { defs, tuck } from './tuck.mjs';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 摺摺 Tuck · torn-paper collage creature · direction C · every movable part is its own <g id="c-…">, pivots in comments -->
${defs()}
${tuck()}
</svg>`;
writeFileSync('../character.svg', svg);

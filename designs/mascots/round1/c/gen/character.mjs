import { writeFileSync } from 'node:fs';
import { defs, tuck } from './tuck.mjs';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 摺摺 Tuck v2 · torn-paper collage creature · direction C. Every movable part is its own <g id="c-…">, pivots in comments.
     Paper colours are custom properties with their day values as fallbacks: c-body, c-flap-back, c-hand, c-leg, c-leg-fold, c-foot, c-ink, c-blush, c-glint (each written as a var with two leading hyphens). -->
${defs()}
${tuck()}
</svg>`;
writeFileSync('../character.svg', svg);

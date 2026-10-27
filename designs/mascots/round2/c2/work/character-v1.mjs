import { writeFileSync } from 'node:fs';
import { defs, tuck } from '../work/tuck-v1.mjs';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 摺摺 Tuck · round 2 (C′, the arms fixed) · torn-paper collage creature. Main pose: "hi", the right-hand arm raised and waving.
     Every movable part is its own <g id="c2-…">, its pivot in a comment, in c2-tuck's own coordinates (c2-tuck's transform only places and scales it).
     Each arm is a strip pinned by a brass brad (c2-brad-l / c2-brad-r, the shoulder pivots); c2-hand-l / c2-hand-r sit inside their arm, so arm and hand turn together.
     Paper colours are custom properties with their day values as fallbacks: c2-body, c2-flap-back, c2-arm, c2-glove, c2-brad, c2-brad-rim, c2-brad-glint, c2-leg, c2-leg-fold, c2-foot, c2-ink, c2-blush, c2-glint (each written as a var with two leading hyphens). -->
${defs()}
${tuck('c2-', { wrap: 'translate(400 418) scale(1.2) translate(-404 -440)', blushKind: 'hatch' })}
</svg>`;
writeFileSync('../character.svg', svg);

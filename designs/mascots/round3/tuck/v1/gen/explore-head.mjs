// Exploration only: the head at large and small sizes (day, night, silhouette) to judge the fringe.
import { writeFileSync } from 'node:fs';
import * as T from './tk.mjs';
import { extraDefs, FIG, CREAM, NIGHT } from './concept.mjs';
const F = T.F;
const use = `<g visibility="hidden"><g id="hd">${T.figure('tk-x-', T.MAIN)}</g><g id="hr">${T.figure('tk-y-', {})}</g></g>`;
const pl = (id, x, y, h, sil) => `<g transform="translate(${x} ${y}) scale(${h / FIG.h}) translate(${-FIG.cx} ${-FIG.cy})"><use href="#${id}"${sil ? ` filter="url(#${F}sil)"` : ''}/></g>`;
let b = `<rect width="1200" height="520" fill="${CREAM}"/><rect x="800" width="400" height="520" fill="${NIGHT}"/>`;
b += pl('hd', 200, 260, 480) + pl('hr', 520, 120, 200) + pl('hd', 660, 120, 120) + pl('hr', 740, 120, 96) + pl('hd', 520, 330, 96) + pl('hd', 600, 330, 48) + pl('hr', 650, 330, 48) + pl('hd', 700, 330, 32);
b += pl('hd', 520, 440, 120, true) + pl('hd', 640, 440, 48, true) + pl('hr', 700, 440, 48, true);
b += pl('hd', 960, 200, 200) + pl('hd', 900, 420, 96) + pl('hr', 1000, 420, 96) + pl('hd', 1080, 420, 48) + pl('hr', 1130, 420, 48);
writeFileSync('work/explore-head.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="1200" height="520">${T.defs()}${extraDefs}${use}${b}</svg>`);

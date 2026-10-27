// Self-checks: the character at 120 and 48 px tall (rest and main pose, day and night), black silhouettes (upright,
// upside down, mirrored) at 200 and 48 px, plus the numbers behind the owner's three asks.
import { writeFileSync } from 'node:fs';
import { defs, G, armGlove } from '../gen/card.mjs';
import { figure } from '../gen/figure.mjs';
import { MAIN } from '../gen/concept.mjs';

const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
const sil = `<filter id="k-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
const H = 370, TOP = 331; // rest figure: beret top ≈ 331 … sole 701
const copy = (id, cx, bottom, h, { flipX = false, flipY = false, s = false } = {}) => {
  const k = h / H;
  const fx = flipX ? -1 : 1, fy = flipY ? -1 : 1;
  const pivotY = flipY ? (TOP + 701) / 2 : 701;
  const by = flipY ? bottom - h / 2 : bottom;
  return `<g transform="translate(${cx} ${by}) scale(${k * fx} ${k * fy}) translate(-350 ${-pivotY})"><use href="#${id}"${s ? ' filter="url(#k-sil)"' : ''}/></g>`;
};
let b = '';
// row 1: day paper — rest at 120 / 48, main pose at 120 / 48
b += `<rect x="0" y="0" width="900" height="200" fill="${DAY}"/><rect x="900" y="0" width="600" height="200" fill="${NIGHT}"/>`;
b += copy('k-rest', 120, 170, 120) + copy('k-rest', 260, 170, 48) + copy('k-main', 450, 170, 120) + copy('k-main', 600, 170, 48) + copy('k-rest', 760, 170, 32);
b += copy('k-rest', 1040, 170, 120) + copy('k-rest', 1180, 170, 48) + copy('k-main', 1360, 170, 88);
// row 2: silhouettes 200 px — upright, upside down, mirrored; and 48 px the same
b += `<rect x="0" y="200" width="1500" height="300" fill="#fff"/>`;
b += copy('k-rest', 170, 470, 200, { s: true }) + copy('k-rest', 480, 470, 200, { s: true, flipY: true }) + copy('k-rest', 790, 470, 200, { s: true, flipX: true });
b += copy('k-main', 1090, 470, 160, { s: true });
b += copy('k-rest', 1270, 300, 48, { s: true }) + copy('k-rest', 1350, 300, 48, { s: true, flipY: true }) + copy('k-rest', 1430, 300, 48, { s: true, flipX: true }) + copy('k-main', 1350, 400, 48, { s: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500">${defs()}<defs>${sil}<g id="k-rest">${figure('k-rest-', {})}</g><g id="k-main">${figure('k-main-', MAIN)}</g></defs>${b}</svg>`;
writeFileSync('checks/checks.svg', svg);

// numbers
const r = (n) => Math.round(n * 10) / 10;
const gl = armGlove('l', G.arm.restL), gr = armGlove('r', G.arm.restR);
console.log(JSON.stringify({
  mouthLine: G.mouth[1], eyeLine: G.eyeL[1], shoulderY: G.bradL[1], shouldersBelowMouth: G.bradL[1] - G.mouth[1],
  shoulderAsShareOfCardHeight: r((G.bradL[1] - G.card.y0) / (G.card.y1 - G.card.y0)),
  bradInsetFromEdge: [G.bradL[0] - G.card.x0, G.card.x1 - G.bradR[0]], bradRadius: G.bradR_,
  armD: G.arm.D, gloveR: G.arm.glove, restAngles: [G.arm.restL, G.arm.restR],
  restMittenLowestY: [r(gl[1] + G.arm.glove), r(gr[1] + G.arm.glove)], hipY: G.hipL[1],
  raisedMittenTopY: G.bradL[1] - G.arm.D - G.arm.glove, cardTopY: G.card.y0,
}, null, 1));

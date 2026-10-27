// Beret outline variants for the review pass: the same figure with different crown keys, in colour (120 px) and as
// silhouettes. Run from the card folder: node checks/beret-variants.mjs → checks/beret-variants.svg
import { writeFileSync } from 'node:fs';
import { defs, BERET } from '../gen/card.mjs';
import { figure } from '../gen/figure.mjs';
// A: the first review-pass outline (a rounder dome); B: the one kept (flatter, a thinner left end); C: a wider one
const V = {
  A: [[288, 389], [280, 381], [285, 368], [303, 355], [331, 345], [366, 338], [406, 335], [448, 338], [486, 347], [517, 361],
    [540, 379], [553, 399], [557, 418], [552, 431], [541, 435], [529, 426], [516, 410], [498, 397], [466, 389], [420, 386], [370, 386], [320, 387], [298, 389]],
  B: [[292, 391], [281, 386], [285, 376], [301, 365], [330, 354], [368, 346], [408, 342], [450, 343], [488, 350], [518, 362],
    [540, 380], [553, 400], [557, 418], [552, 431], [541, 435], [529, 426], [516, 410], [498, 397], [466, 389], [420, 386], [370, 386], [320, 387], [300, 389]],
  C: [[290, 391], [276, 385], [280, 373], [298, 360], [330, 348], [372, 340], [416, 338], [458, 342], [494, 352], [522, 366],
    [542, 384], [553, 403], [556, 421], [550, 433], [539, 436], [528, 427], [515, 411], [497, 398], [466, 389], [420, 386], [370, 386], [320, 387], [300, 389]],
};
const sil = `<filter id="v-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
let body = '', uses = '';
Object.entries(V).forEach(([k, keys], i) => {
  BERET.crown.splice(0, BERET.crown.length, ...keys);
  uses += `<g id="v-${k}">${figure('v' + k + '-', {})}</g>`;
  const x = 60 + i * 300;
  body += `<g transform="translate(${x} 20) scale(0.6) translate(-60 -320)"><use href="#v-${k}"/></g>`;
  body += `<g transform="translate(${x} 250) scale(0.45) translate(-60 -320)"><use href="#v-${k}" filter="url(#v-sil)"/></g>`;
  body += `<g transform="translate(${x + 220} 430) scale(0.13) translate(-60 -320)"><use href="#v-${k}"/></g>`;
  body += `<text x="${x}" y="470" font-size="16" font-family="sans-serif">${k}</text>`;
});
writeFileSync('checks/beret-variants.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 480">${defs()}<defs>${sil}${uses}</defs><rect width="960" height="480" fill="#faf2e9"/>${body}</svg>`);

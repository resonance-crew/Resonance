// exploration: crescent orientation and arm colour, rendered as figures on day and night paper
import { writeFileSync } from 'node:fs';
import * as H from '../gen/hush.mjs';
import { figure } from '../gen/rig.mjs';
const vs = [
  { label: 'in a40 R32', deco: { open: 'in', R: 32 }, arm: H.C.arm },
  { label: 'in a36 turn-25 R32', deco: { open: 'in', R: 32, angle: 36, turn: -25 }, arm: H.C.arm },
  { label: 'in a44 turn25 R32', deco: { open: 'in', R: 32, angle: 44, turn: 25, inset: 0.2 }, arm: H.C.arm },
  { label: 'in a40 turn-90 R32', deco: { open: 'in', R: 32, angle: 40, turn: -90, inset: 0.35 }, arm: H.C.arm },
];
const base = { ...H.G.deco }, armC = H.C.arm;
let body = '';
vs.forEach((v, i) => {
  Object.assign(H.G.deco, base, v.deco); H.C.arm = v.arm;
  const fig = figure(`v${i}-`, { armL: -118, armR: 66, tilt: 2 });
  const x = i * 300;
  body += `<g transform="translate(${x} 0)"><rect width="300" height="560" fill="#f4ecdf"/><rect y="560" width="300" height="300" fill="oklch(21% 0.012 60)"/>
  <g transform="translate(-20 300) scale(1.3) translate(-350 -500)">${fig}</g>
  <g transform="translate(40 520) scale(0.12) translate(-350 -500)" filter="url(#sil)">${fig}</g>
  <g transform="translate(100 520) scale(0.12) translate(-350 -500)">${fig}</g>
  <g transform="translate(150 740) scale(0.4) translate(-350 -500)">${figure(`w${i}-`, { glow: true })}</g>
  <text x="10" y="20" font-size="14">${v.label}</text></g>`;
});
Object.assign(H.G.deco, base); H.C.arm = armC;
writeFileSync('work/variants.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 860" width="1200" height="860">${H.defs()}<defs><filter id="sil" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter></defs>${body}</svg>`);

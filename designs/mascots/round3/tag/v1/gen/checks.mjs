// node gen/checks.mjs (from the tag folder) → checks/checks.svg (sizes, silhouettes, night) and the numbers the brief
// asks to verify: shoulders below the mouth line, brads inside the paper edge, resting mittens above the hips.
import { writeFileSync } from 'node:fs';
import { defs, G } from './tag.mjs';
import { figure, MAIN } from './concept.mjs';

// ---- the numbers ----
const D2R = Math.PI / 180;
const distToLine = (p, a, b) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
const [apex, shR, btR, btL, shL] = G.V;
const restMittenBottom = side => {
  const S = side === 'l' ? G.bradL : G.bradR, a = G.armRest[side === 'l' ? 0 : 1] * D2R;
  return S[1] + G.armD * Math.sin(a) + G.gloveR; // mitten centre + its radius along the arm (≈ straight down)
};
const report = {
  mouthLineY: G.mouth[1],
  shoulderY: [G.bradL[1], G.bradR[1]],
  shouldersBelowMouthBy: G.bradL[1] - G.mouth[1],
  bradRadius: G.brad,
  bradInsetFromEdge: [distToLine(G.bradL, shL, btL), distToLine(G.bradR, shR, btR)].map(v => +v.toFixed(1)),
  bradInsetInRadii: [distToLine(G.bradL, shL, btL), distToLine(G.bradR, shR, btR)].map(v => +(v / G.brad).toFixed(2)),
  hipY: G.hipL[1], bodyBottomY: btL[1],
  restMittenBottomY: ['l', 'r'].map(s => +restMittenBottom(s).toFixed(1)),
  restMittensAboveHips: ['l', 'r'].every(s => restMittenBottom(s) < G.hipL[1]),
  heightUnits: G.ground - G.top,
};
console.log(JSON.stringify(report, null, 1));

// ---- the sheet of checks ----
const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', MUTED = 'oklch(45% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const SIL = `<filter id="tg-c-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
// both figures measured bow-top to sole: about 118 → 701 in rig units
const FH = 583, FX = 350, FY = 410;
const place = (id, x, y, h, extra = '', sil = false) => `<g transform="translate(${x} ${y}) ${extra} scale(${h / FH}) translate(${-FX} ${-FY})"><use href="#${id}"${sil ? ' filter="url(#tg-c-sil)"' : ''}/></g>`;
const lab = (x, y, t) => `<text x="${x}" y="${y}" font-size="13" fill="${MUTED}" ${font} text-anchor="middle">${t}</text>`;
const hidden = `<g visibility="hidden">${figure('tg-cm-', { ...MAIN, noShadow: true })}${figure('tg-cr-', { noShadow: true })}</g>`;
let day = '', sil = '', night = '';
// row 1: colour, day paper — stage size (Tuck's 120 px desktop ⇒ this tag's 1.35 × in series units), 120, 88, 48, 32
const stage = Math.round(120 / 420 * FH);
day += place('tg-cr-fig', 80, 180, stage) + lab(80, 300, `首頁尺寸 ${stage} px`);
day += place('tg-cr-fig', 210, 180, 120) + place('tg-cm-fig', 300, 180, 120) + lab(255, 300, '120 px（站姿／主姿勢）');
day += place('tg-cr-fig', 400, 180, 88) + lab(400, 300, '88 px');
day += place('tg-cr-fig', 480, 180, 48) + place('tg-cm-fig', 530, 180, 48) + lab(505, 300, '48 px');
day += place('tg-cr-fig', 600, 180, 32) + lab(600, 300, '32 px');
// row 2: silhouettes 200 px — upright, upside down, mirrored — and 48 px
sil += place('tg-cr-fig', 90, 470, 200, '', true) + place('tg-cm-fig', 210, 470, 200, '', true) + lab(150, 600, '剪影 200 px（站姿／主姿勢）');
sil += place('tg-cm-fig', 350, 470, 200, 'rotate(180)', true) + lab(350, 600, '上下顛倒');
sil += place('tg-cm-fig', 480, 470, 200, 'scale(-1 1)', true) + lab(480, 600, '左右翻轉');
sil += place('tg-cr-fig', 580, 470, 48, '', true) + place('tg-cm-fig', 620, 470, 48, '', true) + place('tg-cm-fig', 660, 470, 48, 'rotate(180)', true) + lab(620, 600, '剪影 48 px');
// row 3: night paper
night += place('tg-cr-fig', 120, 760, 160) + place('tg-cm-fig', 260, 760, 120) + place('tg-cr-fig', 360, 760, 48) + place('tg-cm-fig', 410, 760, 48);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 880" width="720" height="880">${defs()}<defs>${SIL}</defs>
<rect width="720" height="880" fill="${CREAM}"/>
${hidden}${day}${sil}
<rect x="10" y="640" width="700" height="230" rx="12" fill="${NIGHT}"/>
${night}
<text x="690" y="860" font-size="13" fill="oklch(80% 0.01 70)" ${font} text-anchor="end">夜紙 oklch(21% 0.012 60)</text>
</svg>`;
writeFileSync('checks/checks.svg', svg);
console.log('wrote checks/checks.svg');

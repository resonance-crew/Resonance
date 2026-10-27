// node gen/checks.mjs → checks/sizes.svg and checks/geometry.svg (render them with render.sh); prints the numbers
// the brief asks about: shoulders below the mouth line, brads inside the edge, arms at rest ending above the hips.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { G, BRADS, OUTLINE, defs, mittenCentre, decoPlace } from './hush.mjs';
import { figure } from './rig.mjs';
import { MAIN } from './concept.mjs';
import { path } from './lib.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'checks');
mkdirSync(OUT, { recursive: true });
const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const H0 = 404; // crown (≈298, the crescent) to soles (702)
const sil = `<filter id="sil" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter>`;
const at = (x, base, h, inner, extra = '') => { const s = h / H0; return `<g transform="translate(${(x - 350 * s).toFixed(1)} ${(base - 702 * s).toFixed(1)}) scale(${s.toFixed(4)})"${extra}>${inner}</g>`; };
const lab = (x, y, t, fill = 'oklch(45% 0.03 60)') => `<text x="${x}" y="${y}" font-size="12" fill="${fill}" ${font}>${t}</text>`;

const rest = figure('ck-r-', {}), main = figure('ck-m-', MAIN);
const restN = figure('ck-rn-', { glow: true }), mainN = figure('ck-mn-', { ...MAIN, glow: true });
const flipV = inner => `<g transform="rotate(180 350 500)">${inner}</g>`, flipH = inner => `<g transform="translate(700 0) scale(-1 1)">${inner}</g>`;
const sizes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 560" width="1200" height="560">${defs()}<defs>${sil}</defs>
<rect width="1200" height="190" fill="${DAY}"/><rect y="190" width="1200" height="180" fill="${NIGHT}"/><rect y="370" width="1200" height="190" fill="#fff"/>
${lab(16, 22, '日紙：靜止 120 / 48 px，主姿勢 120 / 48 px（舞台上桌機約 120、手機約 88）')}
${at(90, 160, 120, rest)}${at(200, 160, 48, rest)}${at(330, 160, 120, main)}${at(440, 160, 48, main)}${at(560, 160, 88, rest)}${lab(530, 180, '88 px')}
${lab(16, 212, '夜紙：同上，星光開著', 'oklch(80% 0.01 60)')}
${at(90, 350, 120, restN)}${at(200, 350, 48, restN)}${at(330, 350, 120, mainN)}${at(440, 350, 48, mainN)}${at(560, 350, 88, restN)}
${lab(16, 392, '剪影：靜止、主姿勢、上下顛倒、左右翻轉（120 與 48 px）')}
${at(90, 540, 120, rest, ' filter="url(#sil)"')}${at(200, 540, 48, rest, ' filter="url(#sil)"')}${at(330, 540, 120, main, ' filter="url(#sil)"')}${at(440, 540, 48, main, ' filter="url(#sil)"')}
${at(580, 540, 120, flipV(main), ' filter="url(#sil)"')}${at(700, 540, 120, flipH(main), ' filter="url(#sil)"')}${at(800, 540, 48, flipH(main), ' filter="url(#sil)"')}
<line x1="660" y1="0" x2="660" y2="560" stroke="#999" stroke-width="0.5" opacity="0.4"/>
${lab(680, 22, '頭飾放大：48 px 的整隻角色 × 4（右）')}
</svg>`;
writeFileSync(resolve(OUT, 'sizes.svg'), sizes);

// geometry: the rig at 1:1 with the lines the brief names
const [ml, mr] = [mittenCentre('l', G.rest.armL), mittenCentre('r', G.rest.armR)];
const mittenBottom = Math.max(ml[1], mr[1]) + G.mitten * 1.0;
const near = p => Math.min(...OUTLINE.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
const numbers = {
  mouthY: G.mouth[1], shoulderY: G.shoulderY, shoulderBelowMouth: G.shoulderY - G.mouth[1],
  eyeY: G.eyeY, hipY: G.hipY, bodyTop: Math.min(...OUTLINE.map(p => p[1])).toFixed(1), heightGroundToTop: (G.ground - Math.min(...OUTLINE.map(p => p[1]))).toFixed(1),
  bradR: G.bradR, bradToEdge: [near(BRADS.l).toFixed(1), near(BRADS.r).toFixed(1)], bradToEdgeInRadii: [(near(BRADS.l) / G.bradR).toFixed(2), (near(BRADS.r) / G.bradR).toFixed(2)],
  armD: G.armD, mittenR: G.mitten, restMittenBottom: mittenBottom.toFixed(1), restAboveHipsBy: (G.hipY - mittenBottom).toFixed(1),
  raisedMittenTop_at_main: (mittenCentre('l', MAIN.armL)[1] - G.mitten).toFixed(1), mainWaveAngle: MAIN.armL, restAngles: G.rest, firstPassMittens: G.firstPassMittens,
  bodyWidth: (Math.max(...OUTLINE.map(p => p[0])) - Math.min(...OUTLINE.map(p => p[0]))).toFixed(1),
  deco: decoPlace(),
};
const line = (y, col, t, dy = 4) => `<line x1="90" y1="${y}" x2="610" y2="${y}" stroke="${col}" stroke-width="1.2" stroke-dasharray="6 4"/><text x="612" y="${y + dy}" font-size="12" fill="${col}" ${font}>${t}</text>`;
const geometry = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 760" width="760" height="760">${defs()}
<rect width="760" height="760" fill="${DAY}"/>
${rest}
<path d="${path(OUTLINE)}" fill="none" stroke="oklch(60% 0.15 145)" stroke-width="1" opacity="0.8"/>
${line(G.eyeY, 'oklch(55% 0.1 250)', '眼線')}
${line(G.mouth[1], 'oklch(55% 0.15 30)', '嘴線')}
${line(G.shoulderY, 'oklch(55% 0.15 300)', '肩（銅釘）')}
${line(G.hipY, 'oklch(50% 0.12 145)', '臀（腿的軸心）', 14)}
${line(mittenBottom, 'oklch(55% 0.13 70)', '手套下緣（靜止）', -4)}
${[BRADS.l, BRADS.r].map(b => `<circle cx="${b[0]}" cy="${b[1]}" r="${G.bradInset}" fill="none" stroke="oklch(55% 0.15 300)" stroke-width="1" stroke-dasharray="3 3"/>`).join('')}
<text x="20" y="740" font-size="12" fill="oklch(40% 0.03 60)" ${font}>肩在嘴線下 ${numbers.shoulderBelowMouth}；銅釘離撕邊 ${numbers.bradToEdge.join(' / ')}（${numbers.bradToEdgeInRadii.join(' / ')} 個半徑）；靜止手套下緣高於臀線 ${numbers.restAboveHipsBy}</text>
</svg>`;
writeFileSync(resolve(OUT, 'geometry.svg'), geometry);
console.log(JSON.stringify(numbers, null, 1));

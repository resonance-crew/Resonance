import { writeFileSync } from 'node:fs';
import { spline, poly, tear, path, smoothPath, reflect, side, ellipse } from './lib.mjs';

const kraft = 'oklch(74% 0.055 68)', cream = 'oklch(93% 0.025 85)', sage = 'oklch(80% 0.045 140)', peach = 'oklch(82% 0.06 50)', lav = 'oklch(84% 0.035 290)', ink = 'oklch(30% 0.02 60)';
const defs = `<defs>
<filter id="c-x-paper" x="-10%" y="-10%" width="120%" height="120%">
 <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" result="n"/>
 <feDisplacementMap in="SourceGraphic" in2="n" scale="3" result="t"/>
 <feMorphology in="t" operator="dilate" radius="1.6" result="d"/>
 <feFlood flood-color="oklch(97% 0.012 85)"/><feComposite in2="d" operator="in" result="rim"/>
 <feGaussianBlur in="d" stdDeviation="2.5" result="b"/><feOffset dx="2" dy="4" result="o"/>
 <feFlood flood-color="oklch(30% 0.03 60)" flood-opacity="0.22"/><feComposite in2="o" operator="in" result="sh"/>
 <feMerge><feMergeNode in="sh"/><feMergeNode in="rim"/><feMergeNode in="t"/></feMerge>
</filter></defs>`;

function eyes(x1, y1, x2, y2, r = 9) {
  return `<g fill="${ink}"><ellipse cx="${x1}" cy="${y1}" rx="${r * 0.8}" ry="${r}"/><ellipse cx="${x2}" cy="${y2}" rx="${r * 0.75}" ry="${r * 0.95}"/></g>
  <g stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"><path d="M${x1 - 12},${y1 - 14} q12,-7 22,1"/><path d="M${x2 - 10},${y2 - 13} q11,-6 20,2"/></g>`;
}

// ---------- A: dog-ear pebble ----------
function dogEar(ox) {
  const keys = [[160, 250], [250, 205], [370, 215], [395, 360], [360, 470], [250, 500], [150, 470], [118, 360]].map(([x, y]) => [x + ox, y]);
  let body = tear(spline(keys, 9), 11, { jag: 1.4, wander: 10 });
  const A = [ox + 300, 210], B = [ox + 392, 300];
  const keep = body.filter(p => side(p, A, B) <= 0);
  const cut = body.filter(p => side(p, A, B) > 0);
  // rebuild: keep points in order, insert crease A..B straight
  const iA = body.findIndex(p => side(p, A, B) <= 0);
  let ordered = [];
  for (let i = 0; i < body.length; i++) { const p = body[(iA + i) % body.length]; ordered.push(p); }
  const inside = ordered.filter(p => side(p, A, B) > 0);
  const outside = ordered.filter(p => side(p, A, B) <= 0);
  const flap = [A, ...outside.map(p => reflect(p, A, B)), B];
  const legs = [[200, 490], [300, 492]].map(([x, y], k) => {
    let pts = []; const w = 26;
    for (let i = 0; i < 6; i++) { const dx = (i % 2 ? 7 : -7) * (k ? -1 : 1); pts.push([[x + ox + dx - w / 2, y + i * 16], [x + ox + dx + w / 2, y + i * 16]]); }
    let s = '';
    for (let i = 0; i < 5; i++) { const [a, b] = pts[i], [c, d] = pts[i + 1]; s += `<path d="M${a}L${b}L${d}L${c}Z" fill="${i % 2 ? peach : 'oklch(74% 0.07 48)'}"/>`; }
    return s;
  }).join('');
  const armL = tear(spline([[ox + 140, 360], [ox + 105, 400], [ox + 92, 455], [ox + 118, 440], [ox + 150, 395]], 5), 3, { jag: 1.5, wander: 4 });
  const armR = tear(spline([[ox + 380, 350], [ox + 430, 300], [ox + 455, 255], [ox + 440, 300], [ox + 395, 375]], 5), 4, { jag: 1.5, wander: 4 });
  return `<g filter="url(#c-x-paper)">${legs}</g>
  <path d="${path(armL)}" fill="${lav}" fill-opacity="0.85" filter="url(#c-x-paper)"/>
  <path d="${path(inside.length ? [...inside, B, A] : keep)}" fill="${kraft}" filter="url(#c-x-paper)"/>
  <path d="${path(flap)}" fill="${cream}" filter="url(#c-x-paper)"/>
  <path d="${path(armR)}" fill="${lav}" fill-opacity="0.85" filter="url(#c-x-paper)"/>
  ${eyes(ox + 215, 350, ox + 290, 352)}
  <path d="M${ox + 242},${392} q12,9 24,0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <text x="${ox + 250}" y="590" text-anchor="middle" font-size="20" fill="${ink}" font-family="PingFang TC">A 摺角（折起的一角當耳朵＋風琴摺腿）</text>`;
}

// ---------- B: curl-top ----------
function curl(ox) {
  const keys = [[170, 300], [200, 200], [300, 175], [345, 260], [360, 380], [340, 480], [250, 505], [165, 480], [150, 390]].map(([x, y]) => [x + ox, y]);
  const body = tear(spline(keys, 9), 21, { jag: 1.4, wander: 10 });
  // the peeled curl: reverse side, curling forward over the brow
  const curlKeys = [[178, 262], [205, 190], [300, 172], [350, 245], [340, 290], [312, 300], [300, 270], [270, 250], [230, 262], [200, 290]].map(([x, y]) => [x + ox, y]);
  const c = tear(spline(curlKeys, 5), 22, { jag: 1.8, wander: 5 });
  const roll = `<path d="M${ox + 300},270 q14,-4 18,10 q4,16 -14,22" stroke="${ink}" stroke-width="2" fill="none"/>`;
  const feet = [[205, 500], [295, 500]].map(([x, y]) => `<path d="${path(tear(ellipse(x + ox, y + 8, 30, 13), x, { jag: 1.4, wander: 3 }))}" fill="${sage}" filter="url(#c-x-paper)"/>`).join('');
  return `${feet}<path d="${path(body)}" fill="${sage}" filter="url(#c-x-paper)"/>
  <path d="${path(c)}" fill="${cream}" filter="url(#c-x-paper)"/>${roll}
  <ellipse cx="${ox + 250}" cy="${305}" rx="70" ry="10" fill="oklch(40% 0.03 60)" opacity="0.12"/>
  ${eyes(ox + 222, 330, ox + 290, 332)}
  <path d="M${ox + 248},${370} q9,7 18,0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <text x="${ox + 250}" y="590" text-anchor="middle" font-size="20" fill="${ink}" font-family="PingFang TC">B 捲捲（頂端撕起捲成浪頭）</text>`;
}

// ---------- C: fringe ----------
function fringe(ox) {
  const keys = [[250, 170], [320, 250], [350, 360], [345, 420], [155, 420], [150, 360], [180, 250]].map(([x, y]) => [x + ox, y]);
  const body = tear(spline(keys, 9), 31, { jag: 1.4, wander: 10 });
  let strips = '';
  for (let i = 0; i < 9; i++) {
    const x = ox + 160 + i * 22, len = 60 + ((i * 37) % 23);
    const s = tear(poly([[x, 410], [x + 18, 410], [x + 16 + (i % 2 ? 4 : -3), 410 + len], [x + 2, 410 + len - 4]], 5), 40 + i, { jag: 1.2, wander: 2 });
    strips += `<path d="${path(s)}" fill="${i % 3 === 1 ? lav : 'oklch(86% 0.045 88)'}" filter="url(#c-x-paper)"/>`;
  }
  const hood = tear(spline([[ox + 175, 290], [ox + 200, 205], [ox + 252, 160], [ox + 312, 210], [ox + 335, 290], [ox + 300, 260], [ox + 250, 250], [ox + 200, 262]], 5), 33, { jag: 1.8, wander: 5 });
  return `${strips}<path d="${path(body)}" fill="oklch(86% 0.045 88)" filter="url(#c-x-paper)"/>
  <path d="${path(hood)}" fill="${peach}" fill-opacity="0.9" filter="url(#c-x-paper)"/>
  ${eyes(ox + 222, 320, ox + 282, 322)}
  <path d="M${ox + 245},${358} q8,6 16,0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <text x="${ox + 250}" y="590" text-anchor="middle" font-size="20" fill="${ink}" font-family="PingFang TC">C 流蘇（撕成條的裙襬當腳）</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 620" width="1500" height="620">${defs}
<rect width="1500" height="620" fill="oklch(96.5% 0.015 75)"/>
${dogEar(0)}${curl(500)}${fringe(1000)}
</svg>`;
writeFileSync('../explore.svg', svg);

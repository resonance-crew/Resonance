// node gen/checks.mjs (from the character's folder): writes the self-check sheets into work/*.svg; render them with
// render.sh into checks/. Sizes: the main pose and the rest pose at 120 and 48 px tall, on the day and night papers;
// the rest rig with its guide lines (mouth line, shoulders, hips, the disc's edge, the brads' distance in).
import { writeFileSync, readFileSync } from 'node:fs';
import { defs, figure, P } from './dot.mjs';
import { MAIN } from './concept.mjs';

const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
const FIG = { y0: 454, y1: 706, cx: 350 };
const at = (id, x, foot, h) => { const s = h / (FIG.y1 - FIG.y0); return `<g transform="translate(${x} ${foot}) scale(${s.toFixed(4)}) translate(${-FIG.cx} ${-FIG.y1})"><use href="#${id}"/></g>`; };
const font = `font-family="'PingFang TC',sans-serif"`;
const t = (x, y, s, c = '#776') => `<text x="${x}" y="${y}" font-size="12" fill="${c}" ${font}>${s}</text>`;

// 1. sizes
{
  const W = 640, H = 330;
  const row = (y0, bg, ink) => `<rect x="0" y="${y0}" width="${W}" height="165" fill="${bg}"/>
    ${at('m', 90, y0 + 140, 120)}${at('m', 200, y0 + 140, 48)}${at('r', 330, y0 + 140, 120)}${at('r', 440, y0 + 140, 48)}${at('r', 530, y0 + 140, 69)}
    ${t(30, y0 + 158, '主姿勢 120', ink)}${t(176, y0 + 158, '48', ink)}${t(270, y0 + 158, '站姿 120', ink)}${t(430, y0 + 158, '48', ink)}${t(500, y0 + 158, '首頁 69', ink)}`;
  writeFileSync('work/sizes.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}
  <defs><g id="m">${figure('dt-cm-', MAIN)}</g><g id="r">${figure('dt-cr-', {})}</g></defs>
  ${row(0, DAY, '#776')}${row(165, NIGHT, '#bbb')}</svg>`);
}

// 2. geometry: the rest rig with guides
{
  const rig = readFileSync('rig.svg', 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const g = (y, c, s, dy = 0) => `<path d="M200,${y} L500,${y}" stroke="${c}" stroke-width="0.8" stroke-dasharray="4 3"/><text x="502" y="${y + 3 + dy}" font-size="8" fill="${c}" ${font}>${s}</text>`;
  const mouthY = P.mouth[1] + 2;
  const inL = P.r - Math.hypot(P.shoulderL[0] - P.cx, P.shoulderL[1] - P.cy), inR = P.r - Math.hypot(P.shoulderR[0] - P.cx, P.shoulderR[1] - P.cy);
  writeFileSync('work/geometry.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="190 410 400 330" width="1200" height="990">
  <rect x="0" y="0" width="760" height="760" fill="${DAY}"/>${rig}
  <circle cx="${P.cx}" cy="${P.cy}" r="${P.r}" fill="none" stroke="#38c" stroke-width="0.6" stroke-dasharray="2 2"/>
  ${g(mouthY, '#c33', `嘴線 ${mouthY}`, -4)}${g(P.shoulderL[1], '#a60', `肩（銅釘）${P.shoulderL[1]}／${P.shoulderR[1]}`)}${g(P.hipY, '#383', `髖 ${P.hipY}`)}${g(P.cy, '#38c', `圓心 ${P.cy}`, 5)}
  <text x="200" y="732" font-size="8" fill="#a60" ${font}>銅釘半徑 ${P.brad}；中心離紙邊 ${inL.toFixed(1)}／${inR.toFixed(1)}（${(inL / P.brad).toFixed(1)}／${(inR / P.brad).toFixed(1)} 個半徑）；手臂畫在紙後</text>
  <text x="200" y="720" font-size="8" fill="#a60" ${font}>手套中心 ${[0, 1].map(i => { const [sx, sy] = i ? P.shoulderR : P.shoulderL, a = (i ? P.armRestR : P.armRestL) * Math.PI / 180; return `(${(sx + P.armLen * Math.cos(a)).toFixed(0)}, ${(sy + P.armLen * Math.sin(a)).toFixed(0)})`; }).join('／')}，最低點約 ${(P.shoulderL[1] + P.armLen * Math.sin(P.armRestL * Math.PI / 180) + P.gloveR).toFixed(0)}（髖 ${P.hipY}）</text>
  </svg>`);
}

// 3. shy: the stage brings the arms to the front (they cross the body) and turns them so the mittens land on the blush
{
  const aim = (b, c) => Math.atan2(c[1] - b[1], c[0] - b[0]) * 180 / Math.PI;
  const armL = aim(P.shoulderL, P.cheekL), armR = aim(P.shoulderR, P.cheekR);
  writeFileSync('work/shy.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="200 430 300 290" width="600" height="580">${defs()}<rect x="0" y="0" width="760" height="760" fill="${DAY}"/>${figure('dt-shy-', { armL, armR, front: true, eyes: 'shut', blush: 1, tilt: 3 })}
  <text x="210" y="712" font-size="8" fill="#776" ${font}>害羞：手臂移到前面，左 ${armL.toFixed(0)}°、右 ${armR.toFixed(0)}°（銅釘到腮紅 ${Math.hypot(P.cheekL[0] - P.shoulderL[0], P.cheekL[1] - P.shoulderL[1]).toFixed(0)}／${Math.hypot(P.cheekR[0] - P.shoulderR[0], P.cheekR[1] - P.shoulderR[1]).toFixed(0)}，手臂 ${P.armLen}）</text></svg>`);
}
console.log('wrote work/sizes.svg, work/geometry.svg, work/shy.svg');

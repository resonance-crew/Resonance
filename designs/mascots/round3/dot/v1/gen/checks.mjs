// node gen/checks.mjs (from the character's folder): writes the self-check sheets into work/*.svg; render them with
// render.sh into checks/. Sizes: the main pose and the rest pose at 120 and 48 px tall, on the day and night papers;
// the rest rig with its guide lines (mouth line, shoulders, hips, the disc's edge, the brads' distance in).
import { writeFileSync, readFileSync } from 'node:fs';
import { defs, figure, P } from './dot.mjs';
import { MAIN } from './concept.mjs';

const DAY = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)';
const FIG = { y0: 430, y1: 706, cx: 354 };
const at = (id, x, foot, h) => { const s = h / (FIG.y1 - FIG.y0); return `<g transform="translate(${x} ${foot}) scale(${s.toFixed(4)}) translate(${-FIG.cx} ${-FIG.y1})"><use href="#${id}"/></g>`; };
const font = `font-family="'PingFang TC',sans-serif"`;
const t = (x, y, s, c = '#776') => `<text x="${x}" y="${y}" font-size="12" fill="${c}" ${font}>${s}</text>`;

// 1. sizes
{
  const W = 640, H = 330;
  const row = (y0, bg, ink) => `<rect x="0" y="${y0}" width="${W}" height="165" fill="${bg}"/>
    ${at('m', 90, y0 + 140, 120)}${at('m', 200, y0 + 140, 48)}${at('r', 330, y0 + 140, 120)}${at('r', 440, y0 + 140, 48)}${at('r', 530, y0 + 140, 76)}
    ${t(30, y0 + 158, '主姿勢 120', ink)}${t(176, y0 + 158, '48', ink)}${t(270, y0 + 158, '站姿 120', ink)}${t(430, y0 + 158, '48', ink)}${t(500, y0 + 158, '首頁 76', ink)}`;
  writeFileSync('work/sizes.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}
  <defs><g id="m">${figure('dt-cm-', MAIN)}</g><g id="r">${figure('dt-cr-', {})}</g></defs>
  ${row(0, DAY, '#776')}${row(165, NIGHT, '#bbb')}</svg>`);
}

// 2. geometry: the rest rig with guides
{
  const rig = readFileSync('rig.svg', 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const g = (y, c, s) => `<path d="M200,${y} L500,${y}" stroke="${c}" stroke-width="0.8" stroke-dasharray="4 3"/><text x="502" y="${y + 3}" font-size="8" fill="${c}" ${font}>${s}</text>`;
  const mouthY = P.mouth[1] + 2;
  const inL = P.r - Math.hypot(P.shoulderL[0] - P.cx, P.shoulderL[1] - P.cy), inR = P.r - Math.hypot(P.shoulderR[0] - P.cx, P.shoulderR[1] - P.cy);
  writeFileSync('work/geometry.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="190 410 400 300" width="1200" height="900">
  <rect x="0" y="0" width="760" height="760" fill="${DAY}"/>${rig}
  <circle cx="${P.cx}" cy="${P.cy}" r="${P.r}" fill="none" stroke="#38c" stroke-width="0.6" stroke-dasharray="2 2"/>
  ${g(mouthY, '#c33', `嘴線 ${mouthY}`)}${g(P.shoulderL[1], '#a60', `肩（銅釘）${P.shoulderL[1]}／${P.shoulderR[1]}`)}${g(P.hipY, '#383', `髖 ${P.hipY}`)}${g(P.cy, '#38c', `圓心 ${P.cy}`)}
  <text x="200" y="700" font-size="8" fill="#a60" ${font}>銅釘半徑 ${P.brad}；離紙邊 ${inL.toFixed(1)}／${inR.toFixed(1)}（${(inL / P.brad).toFixed(1)}／${(inR / P.brad).toFixed(1)} 個半徑）</text>
  </svg>`);
}
console.log('wrote work/sizes.svg, work/geometry.svg');

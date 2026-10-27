// Check sheets (checks/*.svg): sizes and silhouettes, the shoulder/brad/arm measurements, the thumb at 200 px,
// and round 2 beside round 3 at the same scale.
import * as T from './tk.mjs';
import { CREAM, NIGHT, INK, MUTED, label, extraDefs, FIG } from './concept.mjs';

const F = T.F;
const R2_PNG = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r2/c2/character.png';
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${T.defs()}${extraDefs}${body}</svg>`;
const lab = (x, y, t, size = 13, fill = MUTED) => label(x, y, t, size, fill, 'text-anchor="middle"');

export function sizes() {
  const defsUse = `<g visibility="hidden"><g id="${F}k-hi">${T.figure('tk-k1-', T.MAIN)}</g><g id="${F}k-rest">${T.figure('tk-k2-', {})}</g></g>`;
  const place = (id, x, y, h, extra = '', sil = false) => `<g transform="translate(${x} ${y}) ${extra} scale(${(h / FIG.h).toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})"><use href="#${F}k-${id}"${sil ? ` filter="url(#${F}sil)"` : ''}/></g>`;
  let b = `<rect width="1500" height="560" fill="${CREAM}"/><rect x="760" y="0" width="740" height="280" fill="${NIGHT}"/>`;
  b += label(20, 30, '舉手「嗨」／站好：120 px 與 48 px（日紙、夜紙）', 15, INK);
  b += place('hi', 80, 140, 120) + place('rest', 225, 140, 120) + place('hi', 330, 164, 48) + place('rest', 395, 164, 48);
  b += place('hi', 510, 140, 120, '', true) + place('hi', 610, 164, 48, '', true) + place('rest', 680, 164, 48, '', true);
  b += lab(150, 240, '120 px') + lab(362, 240, '48 px') + lab(600, 240, '剪影 120 / 48');
  b += place('hi', 850, 140, 120) + place('rest', 995, 140, 120) + place('hi', 1100, 164, 48) + place('rest', 1165, 164, 48);
  b += label(20, 310, '剪影：200 px／上下顛倒／左右翻轉／48 px', 15, INK);
  b += place('hi', 130, 430, 200, '', true) + place('hi', 380, 430, 200, 'rotate(180)', true) + place('hi', 630, 430, 200, 'scale(-1 1)', true);
  b += place('rest', 880, 430, 200, '', true) + place('rest', 1130, 430, 200, 'rotate(180)', true);
  b += place('hi', 1300, 430, 48, '', true) + place('hi', 1360, 430, 48, 'rotate(180)', true) + place('hi', 1420, 430, 48, 'scale(-1 1)', true);
  b += lab(130, 548, '嗨 200 px') + lab(380, 548, '上下顛倒') + lab(630, 548, '左右翻轉') + lab(880, 548, '站好 200 px') + lab(1130, 548, '站好 顛倒') + lab(1360, 548, '48 px');
  return svg(1500, 560, defsUse + b);
}

// rest pose at 1.4×: the mouth line, the shoulders, the hip line and the knees, the brads' distance from the edge
export function measures() {
  const k = 1.4, ox = 380 - T.CX * k, oy = 40 - 230 * k;
  const X = x => ox + x * k, Y = y => oy + y * k;
  const line = (y, t, col) => `<path d="M${X(150)},${Y(y)} L${X(660)},${Y(y)}" stroke="${col}" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.85"/>${label(X(664), Y(y) + 5, t, 14, col)}`;
  const hipY = (T.HIPS.l[1] + T.HIPS.r[1]) / 2, kneeY = hipY + T.LEG_LEN.l / 2 + 6;
  const ml = T.mittenAt('l', T.REST.armL), mr = T.mittenAt('r', T.REST.armR);
  const dot = ([x, y], col) => `<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="${col}"/>`;
  let b = `<rect width="1100" height="720" fill="${CREAM}"/>`;
  b += `<g transform="translate(${ox} ${oy}) scale(${k})">${T.figure('tk-ms-', {})}</g>`;
  b += line(T.MOUTH_Y, `嘴巴線 y ${T.MOUTH_Y}`, 'oklch(45% 0.12 30)');
  b += line(T.SHOULDER.l[1], `肩膀（銅釘中心）y ${T.SHOULDER.l[1]}–${T.SHOULDER.r[1]}：嘴巴下方 ${T.SHOULDER.l[1] - T.MOUTH_Y}`, 'oklch(45% 0.1 260)');
  b += line(hipY, `臀線（腿的轉軸）y ${hipY}`, 'oklch(45% 0.1 150)');
  b += line(kneeY, `膝蓋 y ${kneeY}`, 'oklch(50% 0.02 60)');
  b += dot(ml, 'oklch(45% 0.1 260)') + dot(mr, 'oklch(45% 0.1 260)');
  b += label(20, 690, `垂手時手套中心 y ${ml[1].toFixed(0)}／${mr[1].toFixed(0)}（臀線 ${hipY}、紙片底緣約 578、膝蓋約 ${kneeY}）；銅釘半徑 ${T.BRAD_R}，中心離撕邊 ${(2 * T.BRAD_R + 2).toFixed(0)}（約兩顆釘）；肩到手套中心 ${T.ARM.D}（第二輪 164）`, 14, INK);
  return svg(1100, 720, b);
}

// the main pose at 200 px tall, and its raised mitten at 4×
export function thumb() {
  const h = 200, s = h / FIG.h;
  const g = T.mittenAt('l', T.MAIN.armL);
  let b = `<rect width="760" height="300" fill="${CREAM}"/>`;
  b += `<g transform="translate(130 150) scale(${s.toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})">${T.figure('tk-th-', T.MAIN)}</g>`;
  b += `<g transform="translate(350 150) scale(${s.toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})">${T.figure('tk-th2-', {})}</g>`;
  b += `<g transform="translate(590 150) scale(1.6) translate(${-g[0]} ${-g[1]})"><g transform="rotate(${T.MAIN.tilt} ${T.BODY_PIVOT[0]} ${T.BODY_PIVOT[1]})">${T.arm('tk-th3-', 'l', T.MAIN.armL)}</g></g>`;
  b += lab(130, 285, '嗨 200 px') + lab(350, 285, '站好 200 px') + lab(590, 285, '舉起的手套（放大）');
  return svg(760, 300, b);
}

// round 2 (character.png: 800 × 800, Tuck's coordinates at 1.2×) beside round 3 drawn at the same scale
export function beforeAfter() {
  const k = 1.2, ox = 800 + 400 - 404 * k, oy = 70 + 410 - 460 * k;
  const X = x => ox + x * k, Y = y => oy + y * k;
  const P = p => [X(p[0]), Y(p[1])];
  const tl = p => {
    const t = T.MAIN.tilt * Math.PI / 180, [px, py] = T.BODY_PIVOT, dx = p[0] - px, dy = p[1] - py;
    return [px + dx * Math.cos(t) - dy * Math.sin(t), py + dx * Math.sin(t) + dy * Math.cos(t)];
  };
  const col = 'oklch(48% 0.13 40)';
  const note = (n, at, tx, ty, lines) => {
    const [ax, ay] = P(at);
    return `<path d="M${ax},${ay} L${tx},${ty}" stroke="${col}" stroke-width="1.6" fill="none"/><circle cx="${ax}" cy="${ay}" r="5" fill="none" stroke="${col}" stroke-width="2"/>
      <circle cx="${tx}" cy="${ty}" r="13" fill="${col}"/>${label(tx - 4.5, ty + 5.5, String(n), 15, 'white', 'font-weight="700"')}
      ${lines.map((l, i) => label(tx + 20, ty + 6 + i * 20, l, i ? 14 : 16, i ? MUTED : INK, i ? '' : 'font-weight="600"')).join('')}`;
  };
  let b = `<rect width="1900" height="980" fill="${CREAM}"/>`;
  b += `<image href="${R2_PNG}" x="0" y="70" width="800" height="800"/>`;
  b += `<g transform="translate(${ox} ${oy}) scale(${k})">${T.figure('tk-ba-', T.MAIN)}</g>`;
  b += label(40, 50, '第二輪（業主選定的版本）', 22, INK, 'font-weight="600"') + label(840, 50, '第三輪（同一比例）', 22, INK, 'font-weight="600"');
  // round 2 reference marks: its brads on the outline at 249,420 and 565,430, its tab
  const r2 = (x, y) => [x * 1.2 + 400 - 404 * 1.2, y * 1.2 + 410 - 460 * 1.2];
  const tilt2 = p => { const t = 4 * Math.PI / 180, dx = p[0] - 404, dy = p[1] - 580; return [404 + dx * Math.cos(t) - dy * Math.sin(t), 580 + dx * Math.sin(t) + dy * Math.cos(t)]; };
  const ring = ([x, y]) => `<circle cx="${x}" cy="${y + 70}" r="16" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="4 3"/>`;
  b += ring(r2(...tilt2([249, 420]))) + ring(r2(...tilt2([565, 430]))) + ring(r2(...tilt2([290, 262])));
  b += label(40, 900, '虛線圈：第二輪的銅釘釘在撕邊上、在眼睛下方；頭上一根看不出是什麼的紙舌', 14, MUTED);
  b += note(1, tl(T.SHOULDER.r), 1530, 470, ['肩膀往下', '銅釘移到嘴巴下方（第二輪在眼睛下方）']);
  b += note(2, tl(T.SHOULDER.l), 860, 860, ['銅釘往內', '釘在紙面上、離撕邊約兩顆釘，手臂紙條藏在紙後面']);
  b += note(3, tl(T.mittenAt('r', T.MAIN.armR)), 1530, 700, ['手臂短一點', '肩到手套 164 → 120，垂手時手套在紙片底緣']);
  b += note(4, tl([300, 300]), 1530, 170, ['頭上換成紙瀏海', '四綹撕紙瀏海，用銅色迴紋針夾著']);
  return svg(1900, 980, b);
}

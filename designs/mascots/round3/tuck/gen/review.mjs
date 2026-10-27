// checks/review-before-after.svg — round 3's first pass (v1/, kept for the record and never edited) beside the
// revision after the review, drawn by each version's own generator at the same scale: standing, "hi", the reveal
// (v1 as the stage played it: the corner lifted, the right arm barely raised behind the sheet; after review: the
// right mitten in front, pinching the corner), and both standing at the stage's 120 px and at 48 px on both papers.
import * as T from './tk.mjs';
import * as V1 from '../v1/gen/tk.mjs';
import { CREAM, NIGHT, INK, MUTED, label, extraDefs, FIG } from './concept.mjs';

const F = T.F;
const lab = (x, y, t, size = 14, fill = MUTED, w = '') => label(x, y, t, size, fill, `text-anchor="middle" ${w}`);
const at = (x, y, h, inner) => `<g transform="translate(${x} ${y}) scale(${(h / FIG.h).toFixed(4)}) translate(${-FIG.cx} ${-FIG.cy})">${inner}</g>`;
// v1's reveal as the stage engine played it: arm R lifted from rest (lift 32) toward 40 at 0.6 — about 53°
const V1_REVEAL = { flapS: 0.28, armR: 53, mouth: 'open', look: [4, -3], blush: 0.5 };

export function reviewBeforeAfter() {
  const W = 1600, H = 1000, half = W / 2;
  const big = 232; // the same scale on both sides
  const col = [128, 400, 668];
  // the stage's 120 px is the rig height (sheet top to ground, 435 of Tuck's units); FIG.h is 452 of them
  const stage = 120 * FIG.h / (T.GROUND - T.TOP);
  let b = `<rect width="${W}" height="${H}" fill="${CREAM}"/><path d="M${half},30 L${half},${H - 30}" stroke="${INK}" stroke-width="1" opacity="0.15"/>`;
  b += `<g visibility="hidden">
    <g id="${F}rv-a">${V1.figure('tk-rva-', {})}</g><g id="${F}rv-b">${T.figure('tk-rvb-', {})}</g>
  </g>`;
  const sides = [
    { x0: 0, M: V1, title: '第一版（評審前）', key: 'a', poses: [{}, V1.MAIN, V1_REVEAL], hi: '嗨：左手 −117°', rv: '掀角：手只動一點（在紙後）' },
    { x0: half, M: T, title: '評審後', key: 'b', poses: [{}, T.MAIN, T.REVEAL], hi: '嗨：左手 −124°', rv: '掀角：手套到前面捏起折角' },
  ];
  sides.forEach((s, si) => {
    b += label(s.x0 + 40, 56, s.title, 24, INK, 'font-weight="600"');
    s.poses.forEach((p, i) => { b += at(s.x0 + col[i], 268, big, s.M.figure(`tk-rv${si}${i}-`, p)); });
    b += lab(s.x0 + col[0], 450, '站好') + lab(s.x0 + col[1], 450, s.hi) + lab(s.x0 + col[2], 450, s.rv);
    // standing at stage size (120 px, the sheet's height scaled as the stage does) and 48 px, day and night
    b += `<rect x="${s.x0 + 40}" y="510" width="${half - 80}" height="200" rx="12" fill="${CREAM}" stroke="${INK}" stroke-opacity="0.12"/>`;
    b += `<rect x="${s.x0 + 40}" y="720" width="${half - 80}" height="200" rx="12" fill="${NIGHT}"/>`;
    for (const [y, dark] of [[610, false], [820, true]]) {
      b += at(s.x0 + 190, y, stage, `<use href="#${F}rv-${s.key}"/>`) + at(s.x0 + 380, y + 16, 52, `<use href="#${F}rv-${s.key}"/>`);
      b += label(s.x0 + 470, y - 8, dark ? '夜紙' : '日紙', 15, dark ? 'oklch(85% 0.02 75)' : INK);
      b += label(s.x0 + 470, y + 16, '左：舞台大小（約 120 px）', 13, dark ? 'oklch(75% 0.02 75)' : MUTED) + label(s.x0 + 470, y + 38, '右：48 px', 13, dark ? 'oklch(75% 0.02 75)' : MUTED);
    }
  });
  b += label(40, 962, '改了：舉起的手再往外 7°（撕邊外露出一條紙，手套離輪廓更遠）· 肚子的舊摺痕往下 30–36（不再和銅釘排成一條腰帶）· 瀏海深一階（和米白折角分開）· 掀角時右手套到紙前面捏住折角、底下的字寫大寫深', 14, INK);
  b += label(40, 984, '沒改：肩膀 y 470／472、銅釘離撕邊 21、手臂 120、手臂在紙後面、瀏海的形狀和迴紋針、折角、臉、腮紅、風琴腿、綠腳、手套', 13, MUTED);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${T.defs()}${extraDefs}${b}</svg>`;
}

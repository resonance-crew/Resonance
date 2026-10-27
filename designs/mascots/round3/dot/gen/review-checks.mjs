// node gen/review-checks.mjs (from the character's folder, after export-parts): the round-3 review sheets, drawn from
// parts/rest.png (this pass) and v1/parts/rest.png (the first pass), rendered at 2× with the kit's CDP helper.
//   checks/review-before-after.png — the first pass beside this one, same scale, rest pose
//   checks/emoji-compare.png       — 48 and 78 px, colour and silhouette, beside 🙂 and a Mr. Happy-type outline
//   checks/stage-composite.png     — both passes at stage size on the landing (phone hero over the peach blob, light
//                                    and dark; desktop avatar row): Tuck 120 px desktop / 88 phone
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../kit/cdp.mjs';

const DAY = 'rgb(250,242,233)', NIGHT = 'rgb(29,23,19)', INK = '#3a2f27', MUTED = '#7a6c60';
const NOW = '../parts/rest.png', V1 = '../v1/parts/rest.png', NOWR = 'rig.svg', V1R = 'v1/rig.svg';
// the rest pose's box in rig units: curls (v1: 432, now 457) to the soles (706); x 222–478
const TOP = { now: 457, v1: 432 }, SOLE = 706;
const font = `font-family:'PingFang TC','Noto Sans TC',sans-serif`;
// an <img> of a rest.png placed so that rig unit (ux, uy) lands at (x, y) with `k` px per unit
const place = (src, k, ux, uy, x, y, extra = '') => `<img src="${src}" style="position:absolute;left:${(x - ux * k).toFixed(1)}px;top:${(y - uy * k).toFixed(1)}px;width:${(700 * k).toFixed(1)}px;height:${(760 * k).toFixed(1)}px;${extra}">`;
// a rig.svg inlined (an <img> refuses it: the root's bare data-rig attribute is HTML, not XML), its ids renamed so
// two rigs with different filters can share one page, placed as `place` places a PNG
const inlineRig = (file, pre, k, ux, uy, x, y) => readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/id="dt-/g, `id="${pre}`).replace(/url\(#dt-/g, `url(#${pre}`)
  .replace(/<svg([^>]*) width="700" height="760">/, `<svg$1 style="position:absolute;left:${(x - ux * k).toFixed(1)}px;top:${(y - uy * k).toFixed(1)}px;width:${(700 * k).toFixed(1)}px;height:${(760 * k).toFixed(1)}px">`);
const page = (w, h, body) => `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:${DAY};${font}}.c{position:absolute}.t{position:absolute;color:${INK};font-size:15px}.s{position:absolute;color:${MUTED};font-size:12px}</style><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${body}</div>`;

async function shoot(name, w, h, html) {
  const f = resolve(`work/${name}.html`); writeFileSync(f, html);
  const p = await B.open('file://' + f, { width: w, height: h, dpr: 2, wait: 500 });
  writeFileSync(`checks/${name}.png`, await p.shot());
  console.log('wrote checks/' + name + '.png');
}
mkdirSync('checks', { recursive: true });
const B = await launch();

// ---- 1 · before / after, same scale (rig units → 0.85 px; drawn from the two rig.svg files, so both are crisp)
{
  const k = 0.85, W = 980, H = 400;
  const col = (src, x0, bg, label, note) => `<div class="c" style="left:${x0}px;top:0;width:245px;height:${H}px;background:${bg}"></div>
    ${inlineRig(src, 'c' + x0 + '-', k, 350, 700, x0 + 122, 330)}
    <div class="t" style="left:${x0 + 12}px;top:12px;color:${bg === NIGHT ? '#e8dccf' : INK}">${label}</div>
    <div class="s" style="left:${x0 + 12}px;top:${H - 50}px;width:225px;color:${bg === NIGHT ? '#b8aa9c' : MUTED}">${note}</div>`;
  await shoot('review-before-after', W, H, page(W, H,
    col(V1R, 0, DAY, '第一版', '手臂在紙前、銅釘貼邊；捲髮站在頭頂；臉在中間') +
    col(NOWR, 245, DAY, '評審後', '手臂藏在紙後、銅釘在紙面上；捲髮貼在左上；臉往上、橫線加深') +
    col(V1R, 490, NIGHT, '第一版 · 夜紙', '') +
    col(NOWR, 735, NIGHT, '評審後 · 夜紙', '紙色壓深一點（88.5% → 84.5%），膠影加重')));
}

// ---- 2 · beside 🙂 and a Mr. Happy-type outline, 48 and 78 px tall, colour and silhouette
{
  const W = 900, H = 310;
  // the silhouette: alpha thresholded as the concept sheet's (glue shadow and ground shadow drop out), filled near-black
  const sil = 'filter:url(#sil)';
  const silDef = `<svg width="0" height="0" style="position:absolute"><filter id="sil" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/></filter></svg>`;
  const pip = (src, top, h, x, foot, s = '') => place(src, h / (SOLE - top), 350, SOLE, x, foot, s);
  // a Mr. Happy-type outline, drawn schematically (a round body, a wide grin, thin black stick limbs, round shoes)
  const happy = (x, foot, h, silhouette) => {
    const k = h / 100, r = 34;
    const cy = 100 - 22 - r, body = silhouette ? '#111' : 'oklch(84% 0.16 80)', ink = '#111';
    return `<svg class="c" style="left:${x - 50 * k}px;top:${foot - 100 * k}px" width="${100 * k}" height="${100 * k}" viewBox="0 0 100 100">
      <g stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M38,${cy + r - 2} L35,94 M62,${cy + r - 2} L65,94 M${50 - r + 2},${cy + 6} L8,${cy + 18} M${50 + r - 2},${cy + 6} L92,${cy + 18}"/></g>
      <g fill="${ink}"><ellipse cx="31" cy="95" rx="8" ry="4"/><ellipse cx="69" cy="95" rx="8" ry="4"/><circle cx="8" cy="${cy + 18}" r="3.4"/><circle cx="92" cy="${cy + 18}" r="3.4"/></g>
      <circle cx="50" cy="${cy}" r="${r}" fill="${body}"/>
      ${silhouette ? '' : `<path d="M30,${cy + 4} Q50,${cy + 26} 70,${cy + 4}" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="41" cy="${cy - 10}" r="2.6" fill="${ink}"/><circle cx="59" cy="${cy - 10}" r="2.6" fill="${ink}"/>`}
    </svg>`;
  };
  const emoji = (x, foot, h, silhouette) => `<div class="c" style="left:${x - h / 2}px;top:${foot - h}px;width:${h}px;height:${h}px;font-size:${h * 0.86}px;line-height:${h}px;text-align:center;font-family:'Apple Color Emoji';${silhouette ? 'filter:brightness(0)' : ''}">🙂</div>`;
  const row = (y, h, label) => {
    const foot = y + h + 10;
    let s = `<div class="s" style="left:14px;top:${y + h / 2}px">${label}</div>`;
    const xs = [150, 240, 330, 420, 560, 650, 740, 830];
    s += emoji(xs[0], foot, h * 0.82) + emoji(xs[1], foot, h * 0.82, true);
    s += happy(xs[2], foot, h) + happy(xs[3], foot, h, true);
    s += pip(V1, TOP.v1, h, xs[4], foot) + pip(V1, TOP.v1, h, xs[5], foot, sil);
    s += pip(NOW, TOP.now, h, xs[6], foot) + pip(NOW, TOP.now, h, xs[7], foot, sil);
    return s;
  };
  const head = [[150, '🙂 表情符號'], [330, 'Mr. Happy 型（示意）'], [605, '點點 第一版'], [785, '點點 評審後']]
    .map(([x, t]) => `<div class="t" style="left:${x - 70}px;width:180px;text-align:center;top:14px;font-size:13px">${t}</div>`).join('');
  await shoot('emoji-compare', W, H, page(W, H, silDef + head + row(48, 78, '78 px') + row(190, 48, '48 px') +
    `<div class="s" style="left:14px;top:${H - 40}px;width:${W - 28}px">彩色與剪影並排（剪影 = 整隻填黑）。評審後：臉在上半部、肚子有橫線和字、手臂從紙後伸出、捲髮貼在頭的左上，剪影是一顆圓加一撮捲髮，不再是頂上一根梗</div>`));
}

// ---- 3 · on the landing at stage size, both passes
{
  const W = 1100, H = 560;
  // phone: the capture is 2× (780 px for 390 CSS px); Tuck 88 → k = 88/420 CSS px per unit; Pip on the headline's
  // right end, over the peach blob (where the stage critic saw it fade)
  const kP = 88 / 420, cropX = 110, cropY = 250, cw = 240, ch = 200;
  const phone = (x0, y0, img, src, label, dark) => `<div class="c" style="left:${x0}px;top:${y0}px;width:${cw}px;height:${ch}px;overflow:hidden">
      <img src="${img}" style="position:absolute;left:${-cropX}px;top:${-cropY}px;width:390px">
      ${place(src, kP, 350, 700, 252 - cropX, 357 - cropY)}</div>
    <div class="s" style="left:${x0}px;top:${y0 + ch + 6}px;${dark ? '' : ''}">${label}</div>`;
  // desktop (1×): Tuck 120 → k = 120/420; Pip at the front of the early storytellers' row (avatars centred y ≈ 722, x 600…)
  const kD = 120 / 420, dX = 440, dY = 590, dw = 300, dh = 180;
  const desk = (x0, y0, img, src, label) => `<div class="c" style="left:${x0}px;top:${y0}px;width:${dw}px;height:${dh}px;overflow:hidden">
      <img src="${img}" style="position:absolute;left:${-dX}px;top:${-dY}px;width:1440px">
      ${place(src, kD, 350, 700, 566 - dX, 738 - dY)}</div>
    <div class="s" style="left:${x0}px;top:${y0 + dh + 6}px">${label}</div>`;
  const L = '../../landing/';
  await shoot('stage-composite', W, H, page(W, H,
    `<div class="t" style="left:14px;top:10px">在首頁上（舞台大小：摺摺桌機 120 px、手機 88 px）</div>` +
    phone(14, 40, L + 'mobile-light.png', V1, '手機 · 桃色塊前 · 第一版') + phone(270, 40, L + 'mobile-light.png', NOW, '手機 · 桃色塊前 · 評審後') +
    phone(560, 40, L + 'mobile-dark.png', V1, '手機 · 夜間 · 第一版', true) + phone(816, 40, L + 'mobile-dark.png', NOW, '手機 · 夜間 · 評審後', true) +
    desk(14, 300, L + 'desktop-light.png', V1, '桌機 · 頭像列前端 · 第一版') + desk(330, 300, L + 'desktop-light.png', NOW, '桌機 · 頭像列前端 · 評審後') +
    desk(700, 300, L + 'desktop-dark.png', NOW, '桌機 · 夜間 · 評審後')));
}
await B.close();

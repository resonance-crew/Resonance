// node ba.mjs (from work/r4): round 3 (v3/) beside round 4 (the shipped parts), same scale → ../../checks/r4-before-after.png.
// Top: both rigs large on the day and night papers. Below: both composed from their exported parts at the stage's real
// sizes (desktop 77, tablet 64, phone 51, 48 px) on both papers, on the phone hero over the peach blob, at the avatar row.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../../kit/cdp.mjs';
import { DAY, NIGHT, INK, MUTED, NIGHT_INK, NIGHT_MUTED, font, box, text, inlineRig, sizesRow, phoneHero, desktopRow } from './compose.mjs';

const OLD = { rig: '../../v3/rig.svg', parts: '../../v3/parts', name: '第三輪' };
const NEW = { rig: '../../rig.svg', parts: '../../parts', name: '第四輪（現在）' };
const W = 1440, BIG = 300, k = 1.05;
let body = text(16, 14, '點點 Pip · 第三輪 → 第四輪：橫線和字', { size: 22, weight: 600, w: 900 }) +
  text(16, 46, '紙色不變（84.5% 0.106 95）。一條印刷藍線（58% 0.06 235，寬 2.6、0.8）→ 兩條褪色的橫線（64% 0.045 232，寬 2.3、0.6），上面那條往上移 12、下面那條再隔 24；「…ry」從 0.5 淡到 0.32，改寫在兩條線中間、坐在下面那條上。', { size: 12.5, color: MUTED, w: W - 40 });
// large, same scale
const big = (x, y, src, pre, bg, label, dark) => box(x, y, 340, BIG, inlineRig(src, pre, k, 350, 585, 170, BIG / 2 + 8) +
  text(12, 10, label, { size: 14, weight: 600, color: dark ? NIGHT_INK : INK }), `background:${bg};border-radius:10px`);
body += big(16, 84, OLD.rig, 'o1-', DAY, OLD.name, false) + big(366, 84, NEW.rig, 'n1-', DAY, NEW.name, false) +
  big(734, 84, OLD.rig, 'o2-', NIGHT, OLD.name + ' · 夜紙', true) + big(1084, 84, NEW.rig, 'n2-', NIGHT, NEW.name + ' · 夜紙', true);
// stage sizes
const y0 = 84 + BIG + 34, RH = 200, SW = 330;
body += text(16, y0 - 22, '首頁上的實際大小（從匯出的部件照舞台的方式組出來，2× 像素；夜紙照舞台暗化 0.9）', { size: 13, color: MUTED, w: 900 });
const row = (y, who) => text(16, y + 8, who.name, { size: 14, weight: 600, w: 110 }) +
  sizesRow(who.parts, 130, y, SW, RH, DAY, false, MUTED) + sizesRow(who.parts, 130 + SW + 10, y, SW, RH, NIGHT, true, NIGHT_MUTED) +
  phoneHero(who.parts, 130 + 2 * (SW + 10), y, 150, RH, false) + phoneHero(who.parts, 130 + 2 * (SW + 10) + 160, y, 150, RH, true) +
  desktopRow(who.parts, 130 + 2 * (SW + 10) + 320, y, 300, RH, false);
const heads = [[130, '日紙：桌機 77 · 平板 64 · 手機 51 · 48 px'], [130 + SW + 10, '夜紙（同樣四種大小）'], [130 + 2 * (SW + 10), '手機首屏 · 桃色塊'], [130 + 2 * (SW + 10) + 160, '手機首屏 · 夜間'], [130 + 2 * (SW + 10) + 320, '桌機 · 頭像列前端']];
body += heads.map(([x, t]) => text(x, y0 - 2, t, { size: 11.5, color: MUTED, w: 330 })).join('');
body += row(y0 + 18, OLD) + row(y0 + 18 + RH + 10, NEW);
const H = y0 + 18 + 2 * (RH + 10) + 14;
const f = resolve('_ba.html');
writeFileSync(f, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff;${font}}</style><div style="position:relative;width:${W}px;height:${H}px;background:#fbf8f4">${body}</div>`);
const b = await launch();
const p = await b.open('file://' + f, { width: W, height: H, dpr: 2, wait: 800 });
writeFileSync('../../checks/r4-before-after.png', await p.shot());
try { await b.close(); } catch {}
console.log('wrote checks/r4-before-after.png', W, H);

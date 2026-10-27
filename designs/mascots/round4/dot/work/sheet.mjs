// node sheet.mjs [pick] (from work/r4): the variants sheet → ../../checks/r4-variants.png. Each row: a close-up from the
// variant's rig.svg, then the variant composed from its exported parts at the stage's real sizes on the day and night
// papers (the night one dimmed as the stage dims it), on the phone hero over the peach blob, and at the desktop avatar row.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from '../../../kit/cdp.mjs';
import { DAY, NIGHT, INK, MUTED, NIGHT_MUTED, ACCENT, font, box, text, inlineRig, sizesRow, phoneHero, desktopRow } from './compose.mjs';

const pick = process.argv[2] || '';
const ROWS = [
  ['v3', '第三輪（目前）', '一條印刷藍線 58% 0.06 235，寬 2.6、不透明 0.8；「…ry」0.5'],
  ['a', 'A · 回到第一版的淡', '一條線，第一版的濃淡：64% 0.055 235，寬 2.1、0.62；字 0.27'],
  ['b', 'B · 業主的想法', '線往上移 12（剛好在銅釘下面），下面再一條，間距 24；褪色的墨 64% 0.045 232，寬 2.3、0.6；字 0.32 坐在上面那條'],
  ['c', 'C · 字寫在兩條線中間', '同 B 的兩條褪色線；「…ry」坐在下面那條線上，夾在兩條線之間，像真的寫在橫線紙上'],
  ['c2', 'C′ · 同 C，線細一點', '寬 2.3 → 1.7，墨深一點（60% 0.05 232、0.62），看起來的濃淡和 C 差不多'],
  ['d', 'D · C 加紅色邊線', 'C ＋ 左邊一條淡淡的雙紅線（legal pad 的邊線）62% 0.13 22、寬 1.1、0.42'],
  ['e', 'E · 三條線', '三條褪色線，間距 19（寬 1.8、0.55）；字坐在中間那條'],
];
const LW = 190, CW = 220, SW = 330, PW = 150, DW = 210, RH = 206, GAP = 10, TOP = 96;
const X = { label: 16, close: 16 + LW, day: 16 + LW + CW + GAP, night: 16 + LW + CW + SW + 2 * GAP };
X.peach = X.night + SW + GAP; X.peachN = X.peach + PW + GAP; X.desk = X.peachN + PW + GAP;
const W = X.desk + DW + 16, H = TOP + ROWS.length * (RH + GAP) + 60;

let body = text(16, 14, '點點 Pip · 第四輪：筆記本的橫線和字', { size: 22, weight: 600, w: 900 }) +
  text(16, 46, '同一張紙（84.5% 0.106 95，業主說好的顏色）。每一列：放大圖（rig.svg）；以下都是從匯出的部件照舞台的方式組出來的：日紙、夜紙（舞台夜間的 0.9 暗化）各四種大小；手機首屏站在標題上、背後是桃色塊；桌機頭像列前端。2× 像素。', { size: 12.5, color: MUTED, w: W - 40 });
const heads = [[X.close, '放大'], [X.day, '日紙：桌機 77 · 平板 64 · 手機 51 · 48 px'], [X.night, '夜紙（同樣四種大小）'], [X.peach, '手機首屏 · 桃色塊'], [X.peachN, '手機首屏 · 夜間'], [X.desk, '桌機 · 頭像列前端']];
body += heads.map(([x, t]) => text(x, TOP - 18, t, { size: 11.5, color: MUTED, w: 330 })).join('');
ROWS.forEach(([n, name, note], i) => {
  const y = TOP + i * (RH + GAP), dir = `v/${n}/parts`;
  const picked = n === pick;
  if (picked) body += `<div style="position:absolute;left:8px;top:${y - 5}px;width:${W - 16}px;height:${RH + 10}px;border:2.5px solid ${ACCENT};border-radius:12px"></div>`;
  body += text(X.label, y + 6, name, { size: 15, weight: 600, w: LW - 14 });
  if (picked) body += text(X.label, y + 30, '推薦', { size: 13, weight: 700, color: '#fff', w: 46, extra: `background:${ACCENT};border-radius:10px;text-align:center;padding:1px 0` });
  body += text(X.label, y + (picked ? 56 : 32), note, { size: 11.5, color: MUTED, w: LW - 14 });
  body += box(X.close, y, CW, RH, inlineRig(`v/${n}/rig.svg`, `r${i}-`, 0.8, 350, 584, CW / 2, RH / 2), `background:${DAY};border-radius:8px`);
  body += sizesRow(dir, X.day, y, SW, RH, DAY, false, MUTED);
  body += sizesRow(dir, X.night, y, SW, RH, NIGHT, true, NIGHT_MUTED);
  body += phoneHero(dir, X.peach, y, PW, RH, false);
  body += phoneHero(dir, X.peachN, y, PW, RH, true);
  body += desktopRow(dir, X.desk, y, DW, RH, false);
});
body += text(16, H - 46, '量測（從匯出的 torso.png，線／字的像素和旁邊紙面的 OKLab 明度差 ΔL，越小越安靜；眼睛 0.56）：第三輪 線 0.20、字 0.23 ｜ A 0.11、0.12 ｜ B 0.10、0.14 ｜ C 0.10、0.14 ｜ C′ 0.11、0.14 ｜ D 同 C ｜ E 0.09、0.14。紙對桃色塊的對比沒變（紙色、膠影都沒動）。', { size: 11.5, color: MUTED, w: W - 40 });
const f = resolve('_sheet.html');
writeFileSync(f, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff;${font}}</style><div style="position:relative;width:${W}px;height:${H}px;background:#fbf8f4">${body}</div>`);
const b = await launch();
const p = await b.open('file://' + f, { width: W, height: H, dpr: 2, wait: 800 });
writeFileSync('../../checks/r4-variants.png', await p.shot());
try { await b.close(); } catch {}
console.log('wrote checks/r4-variants.png', W, H);

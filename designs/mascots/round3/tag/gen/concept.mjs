// concept.svg: the 1600 × 1000 sheet, laid out as round 2's — 牽牽 large on the left in its main pose, its back beside
// it; on the right scale tests and silhouettes, the night paper, and two vignettes.
import { defs, parts, note, G, C } from './tag.mjs';
import { tear, spline, poly, path, pencil } from './lib.mjs';

const CREAM = 'oklch(96.5% 0.015 75)', NIGHT = 'oklch(21% 0.012 60)', INK = 'oklch(26% 0.03 60)', MUTED = 'oklch(48% 0.03 60)';
const font = `font-family="'PingFang TC','Noto Sans TC',sans-serif"`;
const label = (x, y, t, size = 15, fill = MUTED, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${font} ${extra}>${t}</text>`;
const pen = (pts, seed, sw = 1.4, op = 0.5, col = INK) => `<g stroke="${col}" stroke-width="${sw}" opacity="${op}" fill="none" stroke-linecap="round" filter="url(#tg-graphite)">${pencil(pts, seed, 2, 0.6).map(d => `<path d="${d}"/>`).join('')}</g>`;
const D2R = Math.PI / 180;
const rotP = (p, c, deg) => { const a = deg * D2R, x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; };

// The main pose: "hi, this is for you" — the left mitten waves beside its face, the right one holds out a folded note
export const MAIN = { armL: -128, armR: 52, tilt: 2.5, legL: 95.5, legR: 87, perk: 0.6, holdR: 'note' };

// A posed figure in rig units. The body (torso, bow, face, arms) tilts about the torso pivot; legs swing about the hips.
export function figure(P, pose = {}) {
  const o = { tilt: 0, slide: [0, 0], closed: false, mouthKind: 'smile', back: false, extra: '', ...pose };
  const p = parts(P, o);
  const [px, py] = G.torsoPivot;
  const face = o.back ? '' : `<g transform="translate(${o.slide[0]} ${o.slide[1]})">${p.cheeks}${o.closed ? p['eye-l-shut'] + p['eye-r-shut'] : p['eye-l'] + p['eye-r']}${o.mouthKind === 'o' ? p['mouth-o'] : p.mouth}</g>`;
  const body = o.back
    ? p['torso-alt']   // the back carries its own arms and bow behind the card (the rig hides the live ones)
    : `${p.torso}${p.deco}${face}${o.extra}${p['arm-l']}${p['arm-r']}`;
  return `<g id="${P}fig">${o.noShadow ? '' : p.shadow}${p['leg-l']}${p['leg-r']}<g transform="rotate(${o.tilt} ${px} ${py})">${body}</g></g>`;
}

export function conceptSvg() {
  const extraDefs = `<defs>
  <filter id="tg-bggrain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 -1.1 0.62"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="tg-bggrain-night" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="32" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 -1.1 0.6"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="tg-sil" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 7 -2.2"/>
  </filter>
  <clipPath id="tg-clip-night"><rect x="1030" y="262" width="540" height="270" rx="14"/></clipPath>
  <clipPath id="tg-clip-v1"><rect x="1030" y="592" width="262" height="336" rx="14"/></clipPath>
  <clipPath id="tg-clip-v2"><rect x="1308" y="592" width="262" height="336" rx="14"/></clipPath>
</defs>`;

  // the main figure spans x ≈ 190–520, y ≈ 118 (bow) – 701 (soles) in rig units; centre 350,410, height 583
  const FH = 583, FX = 350, FY = 410;
  const MS = 1.27, MX = 400, MY = 548;
  const toMain = (x, y) => [MX + (x - FX) * MS, MY + (y - FY) * MS];
  const main = `<g transform="translate(${MX} ${MY}) scale(${MS}) translate(${-FX} ${-FY})">${figure('tg-main-', MAIN)}</g>`;
  const ground = pencil([toMain(120, 702), toMain(300, 700), toMain(480, 703), toMain(640, 699)], 501, 2, 0.8).map(d => `<path d="${d}"/>`).join('');
  // wave marks beside the raised mitten
  const a = MAIN.armL * D2R;
  const gl0 = [G.bradL[0] + G.armD * Math.cos(a), G.bradL[1] + G.armD * Math.sin(a)];
  const gl = toMain(...rotP(gl0, G.torsoPivot, MAIN.tilt));
  const marks = [
    [[gl[0] - 50, gl[1] - 40], [gl[0] - 68, gl[1] - 56]],
    [[gl[0] - 62, gl[1] + 2], [gl[0] - 86, gl[1] - 1]],
    [[gl[0] - 48, gl[1] + 42], [gl[0] - 68, gl[1] + 54]],
  ].map((m, i) => pen(m, 610 + i, 2.2, 0.55)).join('');

  // its back: turned round, the uncoated side with 「給：」 and a blank line
  const BS = 0.6, BX = 820, BY = 640;
  const back = `<g transform="translate(${BX} ${BY}) scale(${BS}) translate(${-FX} ${-FY})">${figure('tg-back-', { back: true, armL: 98, armR: 82 })}</g>`;
  const bGround = pencil([[BX - 120, BY + (702 - FY) * BS], [BX + 120, BY + (700 - FY) * BS]], 503, 2, 0.7).map(d => `<path d="${d}"/>`).join('');

  // (c1) on the landing: sitting on a story card's top edge, long legs hanging over its front, a note held in both mittens
  const v1 = (() => {
    const s = 0.4, cx = 1161, top = 760; // card top edge y in sheet units; the body sits on it
    const card = tear(poly([[1062, top], [1262, top - 2], [1264, 960], [1060, 962]], 6), 811, { amp: 0, jag: 0.5, wander: 2 });
    const cover = tear(poly([[1072, top + 10], [1252, top + 9], [1252, top + 78], [1072, top + 79]], 6), 812, { amp: 0, jag: 0.4, wander: 1.5 });
    const t1 = pen([[1076, top + 102], [1150, top + 101], [1196, top + 103]], 813, 4, 0.55);
    const t2 = pen([[1076, top + 124], [1236, top + 123]], 814, 1.4, 0.3);
    const t3 = pen([[1076, top + 140], [1212, top + 141]], 815, 1.4, 0.3);
    const pose = { armL: 53, armR: 127, tilt: -3, legL: 84, legR: 95, perk: 0.4, slide: [0, 6], noShadow: true,
      extra: note([350, 434], 7, 1.5, -4) };
    // body bottom (rig y 520) sits on the card's top edge; legs are drawn in front of the card
    const fig = `<g transform="translate(${cx} ${top}) scale(${s}) translate(-350 -519)">${figure('tg-v1-', pose)}</g>`;
    return `<g clip-path="url(#tg-clip-v1)">
      <rect x="1030" y="592" width="262" height="360" fill="${CREAM}"/>
      <path d="${path(card)}" fill="oklch(98.5% 0.008 80)" stroke="oklch(62% 0.06 62)" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path(cover)}" fill="oklch(84% 0.05 62)"/>
      <path d="M1072,${top + 58} Q1120,${top + 40} 1160,${top + 56} T1252,${top + 50} L1252,${top + 79} L1072,${top + 79}Z" fill="oklch(72% 0.06 150)" opacity="0.55"/>
      ${t1}${t2}${t3}
      ${fig}
    </g>`;
  })();
  // (c2) shy: asked "is it for me?", mittens up to its cheeks, eyes shut, bow drooping, knees in
  const v2 = `<g clip-path="url(#tg-clip-v2)">
    <rect x="1308" y="592" width="262" height="360" fill="${CREAM}"/>
    <g transform="translate(1439 770) scale(0.4) translate(-350 -410)">${figure('tg-v2-', { armL: -76, armR: -104, tilt: -4, legL: 86, legR: 94, closed: true, mouthKind: 'o', blush: 1, perk: -1, slide: [0, 2] })}</g>
  </g>`;

  const place = (x, y, h, sil = false) => `<g transform="translate(${x} ${y}) scale(${h / FH}) translate(${-FX} ${-FY})"><use href="#tg-main-fig"${sil ? ' filter="url(#tg-sil)"' : ''}/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
${defs()}${extraDefs}
<rect width="1600" height="1000" fill="${CREAM}"/>
<rect width="1600" height="1000" fill="#000" filter="url(#tg-bggrain)" opacity="0.5"/>
<!-- ===== main illustration ===== -->
${label(56, 74, '牽牽 Twine', 34, INK, 'font-weight="600"')}
${label(58, 106, '一張還沒綁到禮物上的吊牌。背面寫著「給：」，後面空著；它一直想把什麼交到某個人手上。', 16)}
${label(58, 130, '摺摺系列的一員：霧藍模切卡紙，比摺摺高 1.35 倍、細長；長長的紙條腿，膝蓋一顆小銅釘；', 14)}
${label(58, 151, '短手，肩上的銅釘釘在紙面內、在嘴巴以下；頭上是自己那條紙繩綁的蝴蝶結。', 14)}
<g stroke="${INK}" stroke-width="1.3" opacity="0.28" fill="none" stroke-linecap="round">${ground}</g>
${marks}
${main}
<g stroke="${INK}" stroke-width="1.2" opacity="0.24" fill="none" stroke-linecap="round">${bGround}</g>
${back}
${label(BX - 104, BY + (702 - FY) * BS + 32, '轉過身：背面寫著「給：」，還沒寫上名字', 13)}
${label(56, 962, '方向 C ｜摺摺系列 · 模切卡紙吊牌 · 主姿勢「嗨，這是給你的」 · 霧藍卡紙、赤陶紙繩蝴蝶結、黃銅雞眼與銅釘、奶油色連指手套', 14)}
<!-- ===== right column ===== -->
<path d="M1006,40 L1006,960" stroke="${INK}" stroke-width="1" opacity="0.12"/>
${label(1030, 62, 'a ｜縮小測試', 15, INK)}
${place(1080, 150, 96)}${label(1062, 222, '96 px', 13)}
${place(1176, 174, 48)}${label(1158, 222, '48 px', 13)}
${place(1300, 150, 96, true)}${label(1272, 222, '剪影 96 px', 13)}
${place(1420, 174, 48, true)}${label(1394, 222, '剪影 48 px', 13)}
${place(1526, 182, 32)}${label(1510, 222, '32 px', 13)}
${label(1030, 250, 'b ｜夜紙 oklch(21% 0.012 60)', 15, INK)}
<g clip-path="url(#tg-clip-night)">
  <rect x="1030" y="262" width="540" height="270" fill="${NIGHT}"/>
  <rect x="1030" y="262" width="540" height="270" fill="#000" filter="url(#tg-bggrain-night)" opacity="0.35"/>
  ${place(1300, 398, 236)}
</g>
${label(1030, 580, 'c ｜在首頁上：坐在故事卡上', 15, INK)}${label(1308, 580, '害羞', 15, INK)}
${v1}${v2}
${label(1032, 952, '長腿垂在卡片前，雙手捧著一張折好的小紙條', 12, MUTED)}${label(1310, 952, '被問「是給我的嗎？」，手套捂住臉頰', 12, MUTED)}
</svg>`;
}

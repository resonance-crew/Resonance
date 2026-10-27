// for a stolen point, is the character actually drawn there? compare the pixel with the stage shown and hidden
import { browser, proto, sleep } from './harness.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const A = JSON.parse(readFileSync(join(import.meta.dirname, '../../landing/anchors.json'), 'utf8'));
const b = await browser();
try {
  for (const [view, at, who, acts, ctrl] of [['desktop', 'browse', 'tuck', 'lean', A.desktop.feedMore.slice(-1)[0]], ['desktop', 'badges', 'card', 'point', A.desktop.badges[1]], ['mobile', 'browse', 'card', 'lean', A.mobile.feedMore.slice(-1)[0]]]) {
    const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=3`, { dpr: 1 });
    await p.eval('__msp.stage.pause()');
    await p.eval(`__msp.visitAt('${at}', '${who}', '${acts}+${acts}')`); await p.eval('__msp.stage.pause()');
    // step into the act, to its middle
    const pts = JSON.parse(await p.eval(`(() => { const st = __msp.stage, F = __msp.frame, c = ${JSON.stringify(ctrl)}; let best = [];
      for (let i = 0; i < 12 * 14; i++) { st.advance(1/12); const vs = st.visitors(); if (!vs.length) break; if (vs[0].mode !== 'act') continue;
        const sr = F.scroll.getBoundingClientRect(), s = F.s, top = F.scroll.scrollTop, hits = [];
        for (let gx = 0.02; gx < 1; gx += 0.04) for (let gy = 0.1; gy < 1; gy += 0.1) { const px = Math.round(sr.left + (c.x + c.w * gx) * s), py = Math.round(sr.top + (c.y + c.h * gy) * s - top);
          const el = document.elementFromPoint(px, py); if (el && el.classList.contains('ms-hit')) hits.push([px, py]); }
        if (hits.length > best.length) { best = hits; if (best.length > 30) break; } }
      return JSON.stringify(best); })()`));
    if (!pts.length) { console.log(view, at, who, 'no stolen points'); continue; }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const clip = { x: Math.min(...xs) - 2, y: Math.min(...ys) - 2, width: Math.max(...xs) - Math.min(...xs) + 4, height: Math.max(...ys) - Math.min(...ys) + 4 };
    const on = await p.shot({ clip }); await p.eval(`document.querySelector('.ms-stage').style.visibility = 'hidden'`); const off = await p.shot({ clip });
    await p.eval(`document.querySelector('.ms-stage').style.visibility = ''`);
    writeFileSync('/tmp/_on.png', on); writeFileSync('/tmp/_off.png', off);
    console.log(view, at, who, 'stolen points', pts.length, 'clip', JSON.stringify(clip), JSON.stringify(pts.map(q => [q[0] - clip.x, q[1] - clip.y])));
    const { execFileSync } = await import('node:child_process');
    console.log(execFileSync('python3', ['-c', `import json,sys
from PIL import Image
a=Image.open('/tmp/_on.png').convert('RGB'); b=Image.open('/tmp/_off.png').convert('RGB')
pts=json.loads(sys.argv[1]); same=sum(1 for x,y in pts if sum(abs(p-q) for p,q in zip(a.getpixel((x,y)),b.getpixel((x,y))))<6)
print('points where nothing of the character is drawn (transparent box):', same, 'of', len(pts))`, JSON.stringify(pts.map(q => [q[0] - clip.x, q[1] - clip.y]))]).toString());
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }

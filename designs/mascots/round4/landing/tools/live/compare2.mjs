// compare.mjs — the prototype (captures of the page, round 3) beside the live page, at the same moments: the same
// character sent to the same ledge, 3.5 s later. Writes landing/compare-<view>.png (prototype left, live right).
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUTD = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/compare';
const PROTO = 'file:///private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/stage/index.html';
const MOMENTS = {
  desktop: [['headline-l', 'night'], ['qr-point', 'tuck'], ['qr-left', 'tuck'], ['avatars-end', 'card'], ['card-2-top', 'tuck'], ['card-5-right', 'tag'], ['browse', 'tuck'], ['write', 'dot'], ['footer-logo', 'night']],
  mobile: [['badge-r', 'tuck'], ['avatars', 'dot'], ['headline-r', 'card'], ['card-2-top', 'tuck'], ['browse', 'night'], ['write', 'tuck'], ['footer-logo', 'night']],
};
mkdirSync(OUTD, { recursive: true });
const b = await launch();
try {
  for (const view of ['desktop', 'mobile']) {
    const W = view === 'desktop' ? 1440 : 390, H = view === 'desktop' ? 900 : 844;
    const live = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: view === 'mobile', dpr: 1 });
    for (let i = 0; i < 400; i++) { if (await live.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
    for (const [id, who] of MOMENTS[view]) {
      // prototype: a window wide enough that its frame shows the page at 1:1
      const proto = await b.open(`${PROTO}?view=${view}&theme=light&reduced=0&seed=3&at=${id}&who=${who}&do=look`, { width: view === 'desktop' ? 1474 : 600, height: 1100 });
      await sleep(4300);
      const pc = JSON.parse(await proto.eval(`(() => { const F = __msp.frame, l = F.V.ledges.find(x => x.id === ${JSON.stringify(id)}); const v = __msp.stage.visitors()[0];
        const pr = F.page.getBoundingClientRect(); const x = v ? v.x : (l.x ?? l.cover?.x ?? l.points[0][0]), y = v ? v.y : (l.y ?? l.ground ?? l.points[0][1]);
        return JSON.stringify({ s: F.s, x: pr.left + x * F.s + scrollX, y: pr.top + y * F.s + scrollY, top: pr.top + scrollY, left: pr.left + scrollX, v }); })()`));
      const clip = (cx, cy, s) => ({ x: Math.max(0, cx - 200 * s), y: Math.max(0, cy - 210 * s), width: 400 * s, height: 270 * s });
      writeFileSync(`${OUTD}/${view}-${id}-proto.png`, await proto.shot({ clip: clip(pc.x, pc.y, pc.s), scale: 1 / pc.s }));
      await proto.close();
      const lv = JSON.parse(await live.eval(`(async () => {
        const L = __landingStage.layout, l = L.ledges.find(x => x.id === ${JSON.stringify(id)});
        const y = l.points ? l.points.reduce((s, q) => s + q[1], 0) / l.points.length : l.kind === 'peek' ? (l.ground ?? l.cover.y + l.cover.h) : l.y;
        window.scrollTo({ top: Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, y - innerHeight * 0.62)), behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => setTimeout(r, 150));
        const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
        const ok = st.visit({ ledge: l.id, slug: ${JSON.stringify(who)}, acts: ['look'] });
        st.advance(3.5);
        const v = st.visitors()[0];
        return JSON.stringify({ ok, x: v ? v.x : 0, y: v ? v.y : y, scroll: scrollY });
      })()`));
      writeFileSync(`${OUTD}/${view}-${id}-live.png`, await live.shot({ clip: { x: Math.max(0, Math.min(W - 400, lv.x - 200)), y: Math.max(0, lv.y - 210), width: Math.min(400, W), height: 270 } }));
      console.log(view, id, who, 'proto', pc.v ? `${Math.round(pc.v.x)},${Math.round(pc.v.y)}` : '-', 'live', lv.ok ? `${Math.round(lv.x)},${Math.round(lv.y)}` : 'no fit');
    }
    await live.close();
    const rows = MOMENTS[view].map(([id]) => [`${OUTD}/${view}-${id}-proto.png`, `${OUTD}/${view}-${id}-live.png`]);
    execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
rows = ${JSON.stringify(rows)}
ims = [[Image.open(a).convert('RGB').resize((400, 270)), Image.open(b).convert('RGB').resize((400, 270))] for a, b in rows]
sheet = Image.new('RGB', (806, len(ims) * 290), 'white'); d = ImageDraw.Draw(sheet)
for i, (a, b) in enumerate(ims):
    sheet.paste(a, (0, i * 290 + 18)); sheet.paste(b, (406, i * 290 + 18))
    d.text((4, i * 290 + 3), rows[i][0].split('/')[-1][:-10] + '  prototype', fill='black'); d.text((410, i * 290 + 3), 'live page', fill='black')
sheet.save('${OUTD}/../compare-${view}.png')
`]);
  }
} finally { await b.close(); }

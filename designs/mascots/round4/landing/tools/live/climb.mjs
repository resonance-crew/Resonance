// climb.mjs — a character climbing onto a card's top, frame by frame (every 1/6 s), clipped around it.
//   node climb.mjs <W> <H> <ledge> <slug> [dark]
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h, id, slug, theme = 'light'] = process.argv.slice(2); const W = Number(w), H = Number(h);
const OUT = `/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/climb-${W}-${id}-${slug}`;
mkdirSync(OUT, { recursive: true });
const b = await launch();
const files = [];
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr: 1, dark: theme === 'dark' });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
  await sleep(500);
  const r = JSON.parse(await p.eval(`(async () => {
    const L = __landingStage.layout, l = L.ledges.find(x => x.id === ${JSON.stringify(id)});
    const y = l.points.reduce((s, q) => s + q[1], 0) / l.points.length;
    window.scrollTo({ top: Math.max(0, y - innerHeight * 0.6), behavior: 'instant' }); window.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 200));
    const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
    const ok = st.visit({ ledge: l.id, slug: ${JSON.stringify(slug)}, acts: ['look', 'swing', 'read'] });
    return JSON.stringify({ ok, y, scroll: scrollY });
  })()`));
  if (!r.ok) throw new Error('no fit ' + JSON.stringify(r));
  for (let k = 0; k < 22; k++) {
    const v = JSON.parse(await p.eval(`(() => { const st = __landingStage.stage; st.advance(${k === 0 ? 0.05 : 1 / 6}); return JSON.stringify(st.visitors()[0] || null); })()`));
    if (!v) break;
    await p.eval(`Promise.all([...document.querySelectorAll('.ms-char img')].map(i => i.decode().catch(() => {}))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
    const f = `${OUT}/f${String(k).padStart(2, '0')}-${v.mode}.png`;
    writeFileSync(f, await p.shot({ clip: { x: Math.max(0, v.x - 150), y: Math.max(r.scroll, r.y - 230), width: 300, height: 290 } }));
    files.push(f);
  }
} finally { await b.close(); }
execFileSync('python3', ['/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live-tools/sheet.py', OUT + '.png', '11', '200', ...files]);
console.log(OUT + '.png');
process.exit(0);

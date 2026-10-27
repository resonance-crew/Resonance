// legs.mjs — a visitor at a place, then the page scrolled (as a reader would) until its feet sit just under the header:
// does it stay with only its legs showing, and for how long?   node legs.mjs <W> <H> <ledge> <slug>
import { launch } from '../cdp4.mjs';
import { writeFileSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h, id, slug] = process.argv.slice(2); const W = Number(w), H = Number(h);
const OUT = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live';
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr: W < 640 ? 2 : 1 });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
  await sleep(500);
  const r = JSON.parse(await p.eval(`(async () => {
    const L = __landingStage.layout, l = L.ledges.find(x => x.id === ${JSON.stringify(id)});
    const y = l.points ? l.points.reduce((s, q) => s + q[1], 0) / l.points.length : l.y;
    window.scrollTo({ top: Math.max(0, y - innerHeight * 0.6), behavior: 'instant' }); window.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 200));
    const st = __landingStage.stage; st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
    const ok = st.visit({ ledge: l.id, slug: ${JSON.stringify(slug)}, acts: ['look', 'read', 'look'] });
    return JSON.stringify({ ok, y });
  })()`));
  await sleep(4000);
  const v = JSON.parse(await p.eval(`JSON.stringify(__landingStage.stage.visitors()[0])`));
  // scroll smoothly so the feet end 30 px under the header's foot
  const target = Math.round(v.y - (82 + 30));
  await p.eval(`window.scrollTo({ top: ${target}, behavior: 'smooth' })`);
  const log = [];
  for (let s = 0; s <= 16; s++) {
    await sleep(1000);
    const st = JSON.parse(await p.eval(`JSON.stringify({ scroll: scrollY, vs: __landingStage.stage.visitors().map(v => v.slug + '@' + v.ledge + ':' + v.mode + ' feet ' + Math.round(v.y - scrollY)) })`));
    log.push(s + 's ' + st.scroll + ' ' + st.vs.join(' | '));
    if (s === 2 || s === 8 || s === 15) writeFileSync(`${OUT}/legs-${W}-${id}-${slug}-${s}s.png`, await p.shot({ clip: { x: 0, y: st.scroll, width: W, height: 260 } }));
  }
  console.log(JSON.stringify({ r, v, target, log }, null, 1));
} finally { await b.close(); }
process.exit(0);

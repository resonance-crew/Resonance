// tour.mjs — every ledge of a preset on the live page: scroll it into view, send a visitor there (the first of the
// slugs that fits), run the stage 3.5 s, clip the region. Writes landing/tour-<w>-<theme>/<id>.png and a contact sheet.
//   node tour.mjs <width> <height> [light|dark] [zh-TW|en]
import { launch } from '../cdp4.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '1440', h = '900', theme = 'light', loc = 'zh-TW'] = process.argv.slice(2);
const W = Number(w), H = Number(h), dpr = 2; const touchArg = process.argv[6];
const dir = `/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/tour-${W}-${theme}${loc === 'en' ? '-en' : ''}${touchArg === '1' ? '-touch' : ''}`;
mkdirSync(dir, { recursive: true });
const b = await launch();
const report = [];
try {
  const p = await b.open(`http://localhost:3000/${loc}`, { width: W, height: H, mobile: touchArg ? touchArg === '1' : W < 1024, dpr, dark: theme === 'dark' });
  for (let i = 0; i < 300; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(100); }
  await sleep(500);
  const ids = JSON.parse(await p.eval('JSON.stringify(__landingStage.layout.ledges.map(l => l.id))'));
  const order = ['tuck', 'card', 'dot', 'night', 'tag'];
  for (const id of ids) {
    const r = JSON.parse(await p.eval(`(async () => {
      const L = __landingStage.layout, l = L.ledges.find(x => x.id === ${JSON.stringify(id)});
      const y = l.points ? l.points.reduce((s, q) => s + q[1], 0) / l.points.length : l.kind === 'peek' ? (l.ground ?? l.cover.y + l.cover.h) : l.y;
      const x = l.points ? l.points[l.points.length >> 1][0] : l.kind === 'peek' ? l.cover.x + (l.side === 'left' ? 0 : l.side === 'right' ? l.cover.w : l.cover.w / 2) : l.x;
      const vh = innerHeight, maxY = document.documentElement.scrollHeight - vh;
      window.scrollTo({ top: Math.max(0, Math.min(maxY, y - vh * 0.62)), behavior: 'instant' });
      await new Promise(r => setTimeout(r, 160));
      const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
      let who = null;
      for (const slug of ${JSON.stringify(order)}) { if (st.visit({ ledge: l.id, slug, acts: ['look'] })) { who = slug; break; } }
      if (who) st.advance(3.5);
      const v = st.visitors()[0];
      return JSON.stringify({ x, y, scroll: scrollY, who, v: v ? { x: Math.round(v.x), y: Math.round(v.y), mode: v.mode, h: Math.round(v.h) } : null });
    })()`));
    report.push({ id, ...r });
    if (r.who) {
      await p.eval(`Promise.all([...document.querySelectorAll('.ms-char img')].map(i => i.decode().catch(() => {}))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
      const cx = Math.max(0, Math.min(W - 420, (r.v ? r.v.x : r.x) - 210));
      const cy = Math.max(r.scroll, Math.min(r.scroll + H - 300, r.y - 220));   // document px: the clip is in the page's own
      const png = await p.shot({ clip: { x: cx, y: cy, width: Math.min(420, W), height: 300 } });
      writeFileSync(`${dir}/${id}.png`, png);
    }
  }
  console.log(JSON.stringify({ W, theme, errors: p.errors, report }, null, 0));
} finally { await b.close(); }
process.exit(0);

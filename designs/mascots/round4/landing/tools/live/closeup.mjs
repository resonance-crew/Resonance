// closeup.mjs — 悄悄 and 點點 (and 摺摺 for reference) sent to given ledges on the live page, clipped at the device's
// own pixels: how the new eyes and the new lines read at their real size.
//   node closeup.mjs <W> <H> <dpr> <light|dark> <ledge:slug,...>
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h, d, theme, list] = process.argv.slice(2);
const W = Number(w), H = Number(h), dpr = Number(d);
const OUT = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/closeups';
mkdirSync(OUT, { recursive: true });
const b = await launch();
const res = [];
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr, dark: theme === 'dark' });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
  await sleep(600);
  for (const pair of list.split(',')) {
    const [id, slug, act = 'look'] = pair.split(':');
    const r = JSON.parse(await p.eval(`(async () => {
      const L = __landingStage.layout, l = L.ledges.find(x => x.id === ${JSON.stringify(id)});
      if (!l) return JSON.stringify({ ok: false, why: 'no ledge' });
      const y = l.points ? l.points.reduce((s, q) => s + q[1], 0) / l.points.length : l.kind === 'peek' ? (l.ground ?? l.cover.y + l.cover.h) : l.y;
      window.scrollTo({ top: Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, y - innerHeight * 0.6)), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 200));
      const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
      const ok = st.visit({ ledge: l.id, slug: ${JSON.stringify(slug)}, acts: [${JSON.stringify(act)}] });
      st.advance(2.6);
      const v = st.visitors().find(v => v.slug === ${JSON.stringify(slug)});
      return JSON.stringify({ ok, v: v ? { x: v.x, y: v.y, h: v.h, mode: v.mode } : null, scroll: scrollY });
    })()`));
    if (!r.ok || !r.v) { res.push({ id, slug, ...r }); continue; }
    for (const [k, extra] of [['a', 0], ['b', 1.4]]) {
      if (extra) await p.eval(`__landingStage.stage.advance(${extra})`);
      await p.eval(`Promise.all([...document.querySelectorAll('.ms-char img')].map(i => i.decode().catch(() => {}))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
      const v = JSON.parse(await p.eval(`JSON.stringify(__landingStage.stage.visitors().find(v => v.slug === ${JSON.stringify(slug)}) || null)`)) || r.v;
      const half = Math.max(70, v.h * 0.85);
      const clip = { x: Math.max(0, v.x - half), y: Math.max(r.scroll, v.y - v.h * 1.25), width: Math.min(W, half * 2), height: v.h * 1.25 + 14 };
      const f = `${OUT}/${W}-${theme}-${slug}-${id}-${act}-${k}@${dpr}x.png`;
      writeFileSync(f, await p.shot({ clip }));
      res.push({ id, slug, act, k, h: Math.round(v.h), mode: v.mode, f });
    }
  }
} finally { await b.close(); }
console.log(JSON.stringify(res));
process.exit(0);

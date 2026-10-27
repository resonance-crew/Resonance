import { browser, proto, sleep } from './harness.mjs';
const b = await browser();
try {
  for (const [view, sc] of [['desktop', 0], ['mobile', 0], ['desktop', 2500], ['mobile', 4400], ['mobile', 600]]) {
    const firsts = [], counts = [], vis = [];
    for (let seed = 1; seed <= 12; seed++) {
      const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=${seed}&scroll=${sc}`, { dpr: 1 });
      await sleep(50);
      const r = JSON.parse(await p.eval(`(() => { const st = __msp.stage; st.pause(); let first = null, n = 0, inDuet = false, visits = 0, prev = new Set();
        for (let i = 0; i < 12 * 180; i++) { st.advance(1/12); const vs = st.visitors(); const d = vs.some(v => v.mode === 'duet');
          if (d && !inDuet) { n++; if (first == null) first = +st.time.toFixed(1); } inDuet = d;
          const cur = new Set(vs.map(v => v.slug + v.ledge)); for (const k of cur) if (!prev.has(k)) visits++; prev = cur; }
        return JSON.stringify({ first, n, visits }); })()`));
      firsts.push(r.first); counts.push(r.n); vis.push(r.visits);
      await p.send('Page.close').catch(() => {});
    }
    console.log(view, 'scroll', sc, 'first meeting (s) per seed:', JSON.stringify(firsts), 'meetings in 180 s:', JSON.stringify(counts), 'visits:', JSON.stringify(vis));
  }
} finally { await b.close(); }

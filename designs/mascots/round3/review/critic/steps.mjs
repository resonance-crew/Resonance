import { browser, proto } from './harness.mjs';
const b = await browser();
try {
  for (const view of ['desktop', 'mobile']) {
    const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=3`, { dpr: 1 });
    await p.eval('__msp.stage.pause()');
    for (const who of ['tuck', 'tag', 'card', 'dot', 'night']) {
      const at = view === 'desktop' ? 'badges' : 'cta-wave';
      await p.eval(`__msp.visitAt('${at}', '${who}', 'look')`); await p.eval('__msp.stage.pause()');
      const r = JSON.parse(await p.eval(`(() => { const st = __msp.stage; let last = null, d = [], t0 = st.time, arrive = null, h = 0;
        for (let i = 0; i < 12 * 12; i++) { st.advance(1/12); const v = st.visitors()[0]; if (!v) break; h = v.h;
          if (v.mode !== 'enter') { arrive = st.time - t0; break; } if (last != null) d.push(Math.abs(v.x - last)); last = v.x; }
        d = d.filter(x => x > 0).sort((a, b) => a - b);
        return JSON.stringify({ arrive: arrive && +arrive.toFixed(2), h: Math.round(h), median: d.length ? +d[d.length >> 1].toFixed(1) : 0, max: d.length ? +d[d.length - 1].toFixed(1) : 0, pxPerSec: d.length ? Math.round(d.reduce((s, x) => s + x, 0) / (d.length / 12)) : 0 }); })()`));
      console.log(view, at, who, JSON.stringify(r), 'max step / height =', (r.max / r.h).toFixed(2));
    }
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }

import { browser, proto, sleep } from './harness.mjs';
const b = await browser();
try {
  for (const flags of ['?view=desktop&theme=light&reduced=0&seed=3&meet=1', '?view=desktop&theme=light&reduced=0&seed=3&fps=smooth&meet=1', '?view=mobile&theme=dark&reduced=0&seed=5&fps=smooth']) {
    const p = await proto(b, flags, { dpr: 2 });
    await sleep(6000);
    const r = await p.eval(`new Promise(res => { const st = __msp.stage; st.resetStats(); const d = []; let last = performance.now(); const t0 = last;
      const f = now => { d.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); const s = st.stats();
        res({ visitors: st.visitors().map(v => v.slug + ':' + v.mode), rafMedian: +d[d.length >> 1].toFixed(1), rafP95: +d[Math.floor(d.length * 0.95)].toFixed(1), tickAvg: +s.avgMs.toFixed(3), tickMax: +s.max.toFixed(2), steps: s.steps, frames: s.n }); } };
      requestAnimationFrame(f); })`);
    console.log(flags, JSON.stringify(r), 'errors', JSON.stringify(await p.eval('__log')));
    // DOM weight
    console.log('   imgs per char', await p.eval(`[...document.querySelectorAll('.ms-char')].map(c => c.querySelectorAll('img').length).join(',')`), 'occluders', await p.eval(`document.querySelectorAll('.msp-occ').length`));
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }

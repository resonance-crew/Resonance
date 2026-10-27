import { browser, proto, sleep } from './harness.mjs';
const b = await browser();
try {
  const p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=3', { dpr: 1 });
  await p.eval('__msp.stage.pause()');
  for (const [at, slug] of [['card-5-right', 'tuck'], ['card-1-left', 'tuck'], ['qr-left', 'tuck'], ['card-5-right', 'night'], ['card-1-left', 'card']]) {
    const res = [];
    for (let k = 0; k < 6; k++) {
      await p.eval(`__msp.visitAt('${at}', '${slug}', 'wave+wave+wave')`); await p.eval('__msp.stage.pause()');
      // step until acting, then sample arm rotations during the waves
      const r = await p.eval(`(() => { const st = __msp.stage; const out = []; for (let i = 0; i < 120; i++) { st.advance(1/12);
        const ch = document.querySelector('.ms-char'); if (!ch) break;
        const L = ch.querySelector('img[src$="/arm-l.png"]').style.transform, R = ch.querySelector('img[src$="/arm-r.png"]').style.transform;
        const s = document.querySelector('[data-status]').innerText.split('\\n')[0];
        if (/揮手/.test(s)) out.push([+(L.match(/-?[\\d.]+/)||[0])[0], +(R.match(/-?[\\d.]+/)||[0])[0]]); }
        return out; })()`);
      // which arm moved most from its first sample
      const dL = Math.max(...r.map(x => Math.abs(x[0] - r[0][0]))), dR = Math.max(...r.map(x => Math.abs(x[1] - r[0][1])));
      res.push(dL > dR ? 'L' : 'R');
    }
    console.log(at, slug, 'waving arm per visit:', res.join(' '));
  }
} finally { await b.close(); }

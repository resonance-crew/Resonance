import { browser, proto } from './harness.mjs';
const b = await browser();
try {
  const p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=3', { dpr: 1 });
  await p.eval('__msp.stage.pause()');
  const tally = { visible: 0, hidden: 0 };
  for (let k = 0; k < 12; k++) {
    const at = k % 2 ? 'card-1-left' : 'card-5-right', hiddenArm = at === 'card-1-left' ? 'r' : 'l';
    await p.eval(`__msp.visitAt('${at}', 'tuck', 'wave')`); await p.eval('__msp.stage.pause()');
    const r = await p.eval(`(() => { const st = __msp.stage; let mx = { l: 0, r: 0 }, base = null;
      for (let i = 0; i < 60; i++) { st.advance(1/12); const ch = document.querySelector('.ms-char'); if (!ch) break;
        const a = { l: parseFloat(ch.querySelector('img[src$="/arm-l.png"]').style.transform.slice(7)), r: parseFloat(ch.querySelector('img[src$="/arm-r.png"]').style.transform.slice(7)) };
        const s = document.querySelector('[data-status]').innerText.split('\\n')[0];
        if (!/揮手/.test(s)) { base = a; continue; }
        mx.l = Math.max(mx.l, Math.abs(a.l - base.l)); mx.r = Math.max(mx.r, Math.abs(a.r - base.r)); }
      return mx; })()`);
    const arm = r.l > r.r ? 'l' : 'r';
    tally[arm === hiddenArm ? 'hidden' : 'visible']++;
    console.log(at, JSON.stringify(r), 'waved', arm, arm === hiddenArm ? 'HIDDEN' : 'visible');
  }
  console.log(tally);
} finally { await b.close(); }

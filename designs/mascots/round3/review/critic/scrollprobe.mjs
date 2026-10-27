import { browser, proto, sleep } from './harness.mjs';
const b = await browser();
try {
  const p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=3', { dpr: 1 });
  await p.eval('__msp.stage.pause()');
  for (const [at, who, dy] of [['card-1-top', 'tuck', 500], ['hero-wave', 'card', 700], ['badges', 'dot', 400], ['card-5-right', 'tag', -600]]) {
    await p.eval(`__msp.visitAt('${at}', '${who}', 'read+look+look')`); await p.eval('__msp.stage.pause()');
    const log = JSON.parse(await p.eval(`(() => { const st = __msp.stage, F = __msp.frame, out = [];
      for (let i = 0; i < 12 * 8; i++) { st.advance(1/12); const v = st.visitors()[0]; if (v && v.mode === 'act') break; }
      st.advance(1); const before = st.visitors().map(v => v.slug + ':' + v.mode + '@' + Math.round(v.x) + ',' + Math.round(v.y));
      F.scroll.scrollTop += ${dy} * F.s;
      for (let i = 0; i < 12 * 10; i++) { st.advance(1/12); if (i % 6 === 0) out.push((i / 12).toFixed(1) + 's ' + st.visitors().map(v => v.slug + ':' + v.mode + '@' + Math.round(v.x) + ',' + Math.round(v.y) + ' ' + v.ledge).join(' | ')); }
      return JSON.stringify({ before, out }); })()`));
    console.log(at, who, 'scroll by', dy, 'before', log.before.join(' '));
    for (const l of log.out) console.log('   ', l);
  }
} finally { await b.close(); }

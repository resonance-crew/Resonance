// fresh.mjs — the first screen of a freshly loaded page, fast-forwarded: when the first meeting or greeting comes.
//   node fresh.mjs <w> <h> <runs> [secs=60]
import { launch } from './cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '390', h = '844', runs = '8', secs = '60'] = process.argv.slice(2);
const W = Number(w);
const b = await launch();
const firsts = [], kinds = {}, ledges = {};
try {
  for (let r = 0; r < Number(runs); r++) {
    const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: Number(h), mobile: W < 1024, dpr: 1 });
    let ok = false;
    for (let i = 0; i < 1200; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) { ok = true; break; } await sleep(50); }
    if (!ok) { console.log('run', r, 'no stage'); await p.close(); continue; }
    const out = JSON.parse(await p.eval(`(() => {
      const st = __landingStage.stage; st.pause(); const T0 = 0;
      st.advance(${Number(secs)} - st.time);
      const ev = window.__landingStageEvents || [];
      const first = ev.find(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
      return JSON.stringify({ first: first ? +first.t.toFixed(1) : null, kind: first ? (first.type === 'meet' ? 'meet' : 'greet') + '@' + (ev.filter(e => e.type === 'enter' && e.slug === first.slug).pop() || {}).ledge : null,
        enters: ev.filter(e => e.type === 'enter').map(e => e.ledge) });
    })()`));
    firsts.push(out.first);
    if (out.kind) kinds[out.kind] = (kinds[out.kind] || 0) + 1;
    for (const l of out.enters) ledges[l] = (ledges[l] || 0) + 1;
    await p.close();
  }
} finally { await b.close(); }
const v = firsts.filter(x => x != null);
console.log(`${W}x${h}: first meeting/greeting (s): ${firsts.map(x => x ?? '—').join(' ')} · within 20 s ${v.filter(x => x <= 20).length}/${firsts.length} · within 60 s ${v.filter(x => x <= 60).length}/${firsts.length}`);
console.log('  where:', JSON.stringify(kinds), '· visits:', JSON.stringify(ledges));

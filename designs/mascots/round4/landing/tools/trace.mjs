// trace.mjs — first-screen sims, events line by line: node trace.mjs <w> <h> <runs> <secs>
import { launch } from './cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '390', h = '844', runs = '4', secs = '60'] = process.argv.slice(2);
const W = Number(w);
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: Number(h), mobile: W < 1024, dpr: W < 640 ? 2 : 1 });
  for (let i = 0; i < 1200; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
  await sleep(300);
  let firsts = [];
  for (let r = 0; r < Number(runs); r++) {
    const out = JSON.parse(await p.eval(`(() => {
      const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false);
      window.__landingStageEvents = []; const T0 = st.time;
      st.advance(${Number(secs)});
      const ev = window.__landingStageEvents;
      const first = ev.find(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
      return JSON.stringify({ first: first ? +(first.t - T0).toFixed(1) : null, line: ev.filter(e => e.type !== 'arrive' && !(e.type === 'act' && !e.pair && !e.with)).map(e => (e.t - T0).toFixed(0) + 's ' + e.slug + ' ' + e.type + (e.act ? ':' + e.act : '') + (e.how ? ':' + e.how : '') + (e.ledge ? '@' + e.ledge : '') + (e.with ? '+' + e.with : '')).join(' · ') });
    })()`));
    firsts.push(out.first);
    console.log(`run ${r}: first ${out.first}\n  ${out.line}`);
  }
  console.log('first meet/greet:', firsts.join(' '), '· within 60 s', firsts.filter(x => x != null && x <= 60).length + '/' + firsts.length);
} finally { await b.close(); }

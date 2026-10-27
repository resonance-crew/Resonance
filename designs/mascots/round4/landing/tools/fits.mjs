// fits.mjs — for each first-screen ledge, how often each character fits (20 tries; an edge's x is random)
import { launch } from './cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '390', h = '844'] = process.argv.slice(2);
const W = Number(w);
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: Number(h), mobile: W < 1024, dpr: W < 640 ? 2 : 1 });
  for (let i = 0; i < 1200; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
  console.log(await p.eval(`(() => {
    const st = __landingStage.stage; st.pause();
    const vp = __landingStage.env.viewport();
    const ids = __landingStage.layout.ledges.filter(l => l.zone === 'hero').map(l => l.id);
    const rows = [];
    for (const id of ids) {
      const r = [id];
      for (const slug of ['tuck', 'tag', 'card', 'dot', 'night']) { let n = 0; for (let i = 0; i < 20; i++) if (st.visit({ ledge: id, slug })) n++; r.push(slug + ' ' + n); }
      rows.push(r.join('  '));
    }
    st.next();
    return rows.join('\\n');
  })()`));
} finally { await b.close(); }

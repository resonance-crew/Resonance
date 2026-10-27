// moment.mjs — a fresh first screen, fast-forwarded to its first meeting or greeting (+1.2 s), screenshotted.
//   node moment.mjs <w> <h> [light|dark] [tries=4]
import { launch } from './cdp4.mjs';
import { writeFileSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '390', h = '844', theme = 'light', tries = '4'] = process.argv.slice(2);
const W = Number(w);
const b = await launch();
try {
  for (let t = 0; t < Number(tries); t++) {
    const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: Number(h), mobile: W < 1024, dpr: W < 640 ? 2 : 1, dark: theme === 'dark' });
    let r = null;
    for (let attempt = 0; attempt < 3 && r === null; attempt++) {
    for (let i = 0; i < 1200; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
    r = await p.eval(`(() => {
      const st = __landingStage.stage; st.pause();
      for (let i = 0; i < 60 * 24; i++) {
        st.advance(1 / 24);
        const e = (window.__landingStageEvents || []).find(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
        if (e) { st.advance(1.2); return JSON.stringify({ t: +e.t.toFixed(1), what: e.type === 'meet' ? 'meet' : 'greet', vs: st.visitors().map(v => v.slug + '@' + v.ledge + ' ' + Math.round(v.h) + 'px') }); }
      }
      return JSON.stringify(null);
    })()`).then(JSON.parse).catch(() => null);   // a hot reload from another session: wait and try again
    }
    if (r) {
      await p.eval(`Promise.all([...document.querySelectorAll('.ms-char img')].map(i => i.decode().catch(() => {}))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
      const f = `landing/moment-${W}-${theme}-${r.what}.png`;
      writeFileSync(f, await p.shot());
      console.log(W, theme, JSON.stringify(r), f);
      break;
    }
    await p.close();
  }
} finally { await b.close(); }

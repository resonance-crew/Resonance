import { launch } from './cdp4.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '1280', h = '800', y = '979', secs = '90'] = process.argv.slice(2);
const b = await launch();
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: Number(w), height: Number(h), mobile: Number(w) < 1024, dpr: Number(w) < 640 ? 2 : 1 });
  for (let i = 0; i < 400; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
  await sleep(500);
  await p.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'))`);
  await sleep(300);
  console.log(await p.eval(`(() => {
    const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false);
    const hdr = __landingStage.layout.header; const log = []; let last = '';
    for (let i = 0; i < ${Number(secs)} * 12; i++) {
      st.advance(1 / 12);
      const vs = st.visitors();
      [...document.querySelectorAll('.ms-char')].forEach((el, j) => {
        let t = 1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; t = Math.min(t, q.top); bb = Math.max(bb, q.bottom); }
        if (bb > 0 && t < 72) { const v = vs[j]; const k = v.slug + v.ledge + v.mode; if (k !== last) { last = k; log.push(i / 12 + 's ' + v.slug + ' @' + v.ledge + ' ' + v.mode + ' top ' + Math.round(t) + ' feet(page) ' + Math.round(v.y) + ' scrollY ' + scrollY); } }
      });
    }
    return log.join('\\n') || 'none';
  })()`));
} finally { await b.close(); }

// under.mjs — at one scroll position, run the stage and catch any frame where a character reaches above the header's
// foot while the page stands still; screenshot the first few and print what was there.
//   node under.mjs <W> <H> <scroll: number|bottom> <secs> [runs=3]
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h, where = 'bottom', secs = '120', runs = '3'] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const OUT = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/under';
mkdirSync(OUT, { recursive: true });
const b = await launch();
const found = [];
try {
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr: 1 });
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) break; await sleep(50); }
  await sleep(500);
  const y = where === 'bottom' ? await p.eval('document.documentElement.scrollHeight - innerHeight') : Number(where);
  await p.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'))`);
  await sleep(400);
  for (let run = 0; run < Number(runs); run++) {
    const r = JSON.parse(await p.eval(`(() => {
      const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh();
      const hdr = __landingStage.layout.header, vp = __landingStage.env.viewport();
      const hits = [];
      for (let i = 0; i < ${Number(secs)} * 12; i++) {
        st.advance(1 / 12);
        for (const el of document.querySelectorAll('.ms-char')) {
          let t = 1e9, l = 1e9, r = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; t = Math.min(t, q.top); l = Math.min(l, q.left); r = Math.max(r, q.right); }
          if (t < hdr - 1 && r > 0 && l < innerWidth) { const vs = st.visitors(); hits.push({ i, t: Math.round(t), vs: vs.map(v => v.slug + '@' + v.ledge + ':' + v.mode + ' y' + Math.round(v.y - scrollY) + ' h' + Math.round(v.h)) }); if (hits.length === 1) { st.__stopAt = i; } break; }
        }
        if (hits.length && i - hits[0].i > 24) break;
      }
      return JSON.stringify({ hdr, vp, scroll: scrollY, hits: hits.slice(0, 30) });
    })()`));
    if (r.hits.length) {
      writeFileSync(`${OUT}/${W}x${H}-${where}-run${run}.png`, await p.shot());
      found.push(r);
    } else found.push({ run, none: true, vp: r.vp, hdr: r.hdr });
  }
} finally { await b.close(); }
console.log(JSON.stringify(found, null, 1));
process.exit(0);

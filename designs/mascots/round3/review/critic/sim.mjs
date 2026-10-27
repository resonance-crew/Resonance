// node sim.mjs <desktop|mobile> <secs> <seeds a-b> [scrolls comma]  — runs the prototype's stage headless-fast (advance) and
// measures: time with 0/1/2 visitors, walking vs acting, first-arrival, meetings, ledge picks, bbox overlap between the two
// and with text rects from anchors.json, entrance durations
import { browser, proto, sleep, HERE } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [view = 'desktop', secs = '120', seeds = '1-10', scrolls = '0'] = process.argv.slice(2);
const A = JSON.parse(readFileSync(join(HERE, '../../landing/anchors.json'), 'utf8'))[view];
const texts = [];
const add = (r, name) => r && texts.push({ ...r, name });
add(A.heroHeadline, 'headline'); for (const l of A.heroLines || []) add(l, 'hero:' + l.text.slice(0, 6));
add(A.feedTitle && { x: A.feedTitle.x, y: A.feedTitle.y, w: A.feedTitle.w, h: A.feedTitle.h }, 'feedTitle');
for (const c of A.cards || []) if (c.title) add(c.title, 'cardTitle');
add(A.ctaTitle, 'ctaTitle'); for (const b of A.ctaButtons || []) add(b, 'ctaButton:' + (b.text || ''));
for (const b of A.feedMore || []) add(b, 'feedMore');
for (const b of A.badges || []) add(b, 'badge');
for (const b of A.qr || []) add(b, 'qr');
const [s0, s1] = seeds.split('-').map(Number);
const b = await browser();
const agg = [];
try {
  for (const sc of scrolls.split(',').map(Number)) for (let seed = s0; seed <= s1; seed++) {
    const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=${seed}&scroll=${sc}`, { dpr: 1, width: 1440, height: 1000 });
    await sleep(100);
    const r = JSON.parse(await p.eval(`(() => {
      const st = __msp.stage; st.pause(); const dt = 1/12, N = Math.round(${Number(secs)} / dt), texts = ${JSON.stringify(texts)};
      const out = { n: [0,0,0], mode: {}, first: null, ledges: {}, pairOverlap: 0, textHit: {}, enterDur: [], visits: 0, duets: 0, seen: new Set() };
      const enterStart = {};
      let prevSlugs = '';
      for (let i = 0; i < N; i++) { st.advance(dt);
        const vs = st.visitors(); out.n[Math.min(2, vs.length)]++;
        if (vs.length && out.first == null) out.first = +st.time.toFixed(2);
        for (const v of vs) { out.mode[v.mode] = (out.mode[v.mode] || 0) + 1;
          const key = v.slug + '@' + v.ledge;
          if (!out.seen.has(key + st.time.toFixed(0)) && v.mode === 'enter' && !enterStart[v.slug + v.ledge]) { enterStart[v.slug + v.ledge] = st.time; }
          if (v.mode === 'act' && enterStart[v.slug + v.ledge]) { out.enterDur.push([v.slug, v.ledge, +(st.time - enterStart[v.slug + v.ledge]).toFixed(2)]); out.ledges[v.ledge] = (out.ledges[v.ledge] || 0) + 1; delete enterStart[v.slug + v.ledge]; }
          if (v.mode === 'duet') out.duet = true;
          // bbox in page px from the DOM: the character's parts
          const el = document.querySelectorAll('.ms-char')[vs.indexOf(v)];
        }
        const els = [...document.querySelectorAll('.ms-char')];
        const F = __msp.frame, sr = F.scroll.getBoundingClientRect();
        const boxes = els.map(el => { let l = 1e9, t = 1e9, r = -1e9, b = -1e9; for (const im of el.querySelectorAll('img')) { if (im.style.visibility === 'hidden') continue; const q = im.getBoundingClientRect(); if (!q.width) continue;
            l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
          const s = F.s; return { x: (l - sr.left) / s, y: (t - sr.top) / s + F.scroll.scrollTop / s, w: (r - l) / s, h: (b - t) / s }; });
        const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
        if (boxes.length === 2) { const ov = inter(boxes[0], boxes[1]); if (ov > 0.15 * Math.min(boxes[0].w * boxes[0].h, boxes[1].w * boxes[1].h)) out.pairOverlap++; }
        boxes.forEach((bx, k) => { const v = vs[k]; if (!v || v.mode === 'enter' || v.mode === 'exit') return; for (const tx of texts) { const ov = inter(bx, tx); if (ov > 0.08 * tx.w * tx.h || ov > 0.25 * bx.w * bx.h * 0.2) { const key = (v.ledge || '?') + ' → ' + tx.name; out.textHit[key] = (out.textHit[key] || 0) + 1; } } });
      }
      out.seen = undefined; out.N = N; return JSON.stringify(out); })()`));
    agg.push({ seed, sc, ...r });
    console.log(view, 'scroll', sc, 'seed', seed, 'first', r.first, 'n0/1/2 %', r.n.map(x => Math.round(100 * x / r.N)).join('/'), 'modes', JSON.stringify(r.mode), 'pairOverlapFrames', r.pairOverlap, 'ledges', JSON.stringify(r.ledges));
    console.log('   enter durations', JSON.stringify(r.enterDur));
    console.log('   text hits (frames)', JSON.stringify(r.textHit));
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }

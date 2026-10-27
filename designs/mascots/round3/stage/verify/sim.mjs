// verify/sim.mjs — runs the stage headless and fast (advance) over the prototype's page and counts what the stage
// critic counted: two characters overlapping, meetings and greetings (and when the first comes), how much of a visit
// is spent doing something, where first-screen visitors go, and clicks the characters steal from buttons.
//   node verify/sim.mjs <desktop|mobile> <secs> <seedFrom-seedTo> [scroll,scroll…] [light|dark]
import { launch } from '../../kit/cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL0 = 'file://' + join(HERE, '..', 'index.html');
const [view = 'desktop', secs = '120', seeds = '1-6', scrolls = '0', theme = 'light'] = process.argv.slice(2);
const [s0, s1] = seeds.split('-').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
const tot = { overlap: 0, overlapNoDuet: 0, meets: 0, greets: 0, firstMeet: [], firstGreet: [], act: 0, travel: 0, stolen: 0, probes: 0, ledges: {}, errors: [] };
try {
  for (const sc of scrolls.split(',').map(Number)) for (let seed = s0; seed <= s1; seed++) {
    const p = await b.open(`${URL0}?view=${view}&theme=${theme}&reduced=0&seed=${seed}&scroll=${sc}`, { width: 1440, height: 1000, dpr: 1 });
    for (let i = 0; i < 100; i++) { if (await p.eval('!!(window.__msp && window.__msp.stage)')) break; await sleep(30); }
    await sleep(80);
    const r = JSON.parse(await p.eval(`(() => {
      const errors = []; window.addEventListener('error', e => errors.push(e.message));
      __msp.stage.destroy();
      const F = __msp.frame, V = F.V;
      const TRAITS = { tuck: { likes: ['read', 'reveal'] }, tag: { pace: 1.1, likes: ['reveal', 'wave'] }, card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
        dot: { likes: ['hop'], openStretch: true }, night: { pace: 0.7, naps: true, likes: ['nap', 'twinkle'], zones: { light: { hero: 0.35, cta: 1.5, footer: 2 }, dark: { hero: 1.3, footer: 1.5 } }, often: { light: 0.8, dark: 1.6 } } };
      const cast = MascotStage.CAST.map(c => ({ ...c, traits: TRAITS[c.slug] || {} }));
      const ev = [];
      const vp = () => ({ x: 0, y: F.scroll.scrollTop / F.s, w: V.page.w, h: F.scroll.clientHeight / F.s });
      const st = MascotStage.createStage({ layer: F.page, ledges: V.ledges, content: V.content, unitHeight: V.unitHeight, theme: '${theme}', reducedMotion: false, viewport: vp },
        cast, { seed: ${seed}, onEvent: e => ev.push(e), autoplay: false, observe: false });
      const out = { where: {}, overlap: 0, overlapNoDuet: 0, act: 0, travel: 0, stolen: 0, probes: 0, ledges: {}, firstMeet: null, firstGreet: null, meets: 0, greets: 0 };
      const sr = F.scroll.getBoundingClientRect(), s = F.s, top = F.scroll.scrollTop / s;
      const buttons = (V.content || []).filter(q => q.y + q.h > top && q.y < top + vp().h);
      const seen = new Set();
      const N = Math.round(${Number(secs)} * 12);
      for (let i = 0; i < N; i++) {
        st.advance(1 / 12);
        const vs = st.visitors();
        const els = [...F.page.querySelectorAll('.ms-char')];
        const boxes = els.map(el => { let l = 1e9, t = 1e9, r = -1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden') continue; const q = im.getBoundingClientRect(); if (!q.width) continue;
            l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bb = Math.max(bb, q.bottom); }
          return { x: (l - sr.left) / s, y: (t - sr.top) / s + top, w: (r - l) / s, h: (bb - t) / s }; });
        const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
        if (boxes.length === 2 && boxes[0].w > 0 && boxes[1].w > 0) {
          const ov = inter(boxes[0], boxes[1]) > 0.15 * Math.min(boxes[0].w * boxes[0].h, boxes[1].w * boxes[1].h);
          if (ov) { out.overlap++; if (!vs.some(v => v.mode === 'duet' || v.mode === 'duet-walk')) out.overlapNoDuet++; }
        }
        for (const v of vs) {
          if (v.mode === 'act' || v.mode === 'duet') out.act++; else if (v.mode === 'enter' || v.mode === 'exit') out.travel++;
          const key = v.slug + '@' + v.ledge; if (!seen.has(key)) { seen.add(key); out.ledges[v.ledge] = (out.ledges[v.ledge] || 0) + 1; }
        }
        for (const k of [...seen]) if (!vs.some(v => v.slug + '@' + v.ledge === k)) seen.delete(k);
        if (i % 3 === 0) for (const q of buttons) for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.25, 0.75]) {
          const cx = sr.left + (q.x + q.w * fx) * s, cy = sr.top + (q.y + q.h * fy - top) * s;
          const e = document.elementFromPoint(cx, cy); out.probes++;
          if (e && e.closest && e.closest('.ms-char')) { out.stolen++; const k = 'rect ' + Math.round(q.x) + ',' + Math.round(q.y) + ' ' + vs.map(v => v.slug + '@' + v.ledge + ':' + v.mode).join('+'); out.where[k] = (out.where[k] || 0) + 1; }
        }
      }
      for (const e of ev) {
        if (e.type === 'meet') { out.meets++; if (out.firstMeet == null) out.firstMeet = +e.t.toFixed(1); }
        if (e.type === 'act' && e.act === 'greet') { out.greets++; if (out.firstGreet == null) out.firstGreet = +e.t.toFixed(1); }
      }
      out.errors = errors;
      return JSON.stringify(out);
    })()`));
    for (const k of ['overlap', 'overlapNoDuet', 'meets', 'greets', 'act', 'travel', 'stolen', 'probes']) tot[k] += r[k];
    tot.firstMeet.push(r.firstMeet); tot.firstGreet.push(r.firstGreet); tot.errors.push(...r.errors);
    for (const [k, v] of Object.entries(r.ledges)) tot.ledges[k] = (tot.ledges[k] || 0) + v;
    console.log(view, 'scroll', sc, 'seed', seed, 'meets', r.meets, 'first', r.firstMeet, '· greets', r.greets, 'first', r.firstGreet,
      '· overlap', r.overlap, '(outside duets', r.overlapNoDuet + ')', '· acting', Math.round(100 * r.act / Math.max(1, r.act + r.travel)) + '%', '· stolen', r.stolen + '/' + r.probes, r.errors.length ? 'ERR ' + r.errors.join(';') : '', r.stolen ? JSON.stringify(r.where) : '');
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }
const visits = Object.values(tot.ledges).reduce((a, x) => a + x, 0);
const firsts = tot.firstMeet.map((m, i) => Math.min(m ?? 1e9, tot.firstGreet[i] ?? 1e9));
console.log('first meeting or greeting per seed (s):', firsts.map(x => (x > 1e8 ? '—' : x)).join(' '), '· within 20 s:', firsts.filter(x => x <= 20).length + '/' + firsts.length,
  '· within 60 s:', firsts.filter(x => x <= 60).length + '/' + firsts.length);
console.log('TOTAL', JSON.stringify({ ...tot, acting: Math.round(100 * tot.act / Math.max(1, tot.act + tot.travel)) + '%',
  ledges: Object.fromEntries(Object.entries(tot.ledges).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, `${v} (${Math.round(100 * v / visits)}%)`])) }));

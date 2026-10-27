// live.mjs — the landing stage on the running dev server, checked as the round-3 sim checked the prototype.
//   node live.mjs <width> <height> <light|dark> [realSecs=30] [simSecs=60] [loc=zh-TW]
// Real time: when the first visitor comes and where, characters under the fixed header, clicks taken from any link or
// button (elementFromPoint at each one's centre), the page's width. Fast-forward (stage.advance at 1/12 s) at three
// scroll positions: overlaps outside meetings, stolen clicks, meetings and greetings, the share of a visit spent acting.
import { launch } from './cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '1440', h = '900', theme = 'light', realSecs = '30', simSecs = '60', loc = 'zh-TW'] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const mobile = W < 1024, dpr = W < 640 ? 2 : 1;
const tag = `${W}x${H}-${theme}${loc === 'en' ? '-en' : ''}`;
mkdirSync('landing/live', { recursive: true });
const b = await launch();
const out = { tag };
try {
  const t0 = Date.now();
  const p = await b.open(`http://localhost:3000/${loc}`, { width: W, height: H, mobile, dpr, dark: theme === 'dark' });
  let ready = null;
  for (let i = 0; i < 1200; i++) { if (await p.eval("!!(window.__landingStage && window.__landingStage.stage)")) { ready = Date.now() - t0; break; } await sleep(50); }
  out.stageAfterLoadMs = ready;
  out.preset = await p.eval('__landingStage.preset.name + " " + __landingStage.preset.unitHeight');
  out.ledges = await p.eval('__landingStage.layout.ledges.map(l => l.id).join(" ")');
  // ---- real time
  const SAMPLE = `(() => {
    const hdr = __landingStage.layout.header;
    const chars = [...document.querySelectorAll('.ms-char')];
    const boxes = chars.map(el => { let l = 1e9, t = 1e9, r = -1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bb = Math.max(bb, q.bottom); } return { l, t, r, b: bb }; });
    const under = boxes.filter(q => q.b > 0 && q.t < hdr - 1 && q.l < innerWidth && q.r > 0).length;
    let stolen = 0, probes = 0; const where = [];
    for (const e of document.querySelectorAll('a[href], button')) {
      const q = e.getBoundingClientRect(); if (!q.width || !q.height) continue;
      const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue;
      probes++;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit.closest && hit.closest('.ms-char')) { stolen++; where.push((e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 16)); }
    }
    const vs = __landingStage.stage ? __landingStage.stage.visitors() : [];
    return JSON.stringify({ n: chars.length, under, stolen, probes, where, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      vs: vs.map(v => ({ slug: v.slug, ledge: v.ledge, mode: v.mode, y: Math.round(v.y), h: Math.round(v.h), inView: v.y > scrollY + hdr && v.y - v.h < scrollY + innerHeight })) });
  })()`;
  const rt = { samples: 0, under: 0, stolen: 0, probes: 0, where: {}, widthOverflow: 0, firstVisitorS: null, firstInView: null, sizes: {}, maxChars: 0 };
  const start = Date.now();
  const shots = new Set([5, 15, Number(realSecs) - 2]);
  while ((Date.now() - start) / 1000 < Number(realSecs)) {
    const s = JSON.parse(await p.eval(SAMPLE));
    rt.samples++; rt.under += s.under ? 1 : 0; rt.stolen += s.stolen; rt.probes += s.probes; rt.maxChars = Math.max(rt.maxChars, s.n);
    for (const k of s.where) rt.where[k] = (rt.where[k] || 0) + 1;
    if (s.sw !== s.cw) rt.widthOverflow++;
    if (s.vs.length && rt.firstVisitorS == null) { rt.firstVisitorS = +((Date.now() - start) / 1000 + (ready || 0) / 1000).toFixed(1); rt.firstInView = s.vs[0].inView + ' @' + s.vs[0].ledge; }
    for (const v of s.vs) rt.sizes[v.slug] = v.h;
    const el = Math.round((Date.now() - start) / 1000);
    if (shots.has(el)) { shots.delete(el); writeFileSync(`landing/live/${tag}-${el}s.png`, await p.shot()); }
    await sleep(150);
  }
  out.realtime = rt;
  out.realEvents = JSON.parse(await p.eval(`JSON.stringify((window.__landingStageEvents || []).map(e => e.type + ':' + (e.act || e.how || '') + (e.cause ? '/' + e.cause : '') + (e.with ? '+' + e.with : '') + '@' + (e.ledge || '')))`));
  out.dim = await p.eval(`(() => { const s = document.querySelector('.ms-stage'); return s ? s.className + ' ' + (s.style.getPropertyValue('--ms-dim') || '-') : 'none'; })()`);
  // ---- fast-forward
  const pageH = await p.eval('document.documentElement.scrollHeight');
  const ys = JSON.parse(await p.eval(`JSON.stringify([0, (() => { const c = document.querySelector('[data-card-id]'); return c ? Math.round(c.getBoundingClientRect().top + scrollY - 200) : 1000; })(), document.documentElement.scrollHeight - innerHeight])`));
  out.sim = [];
  for (const y of ys) {
    await p.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'))`);
    await sleep(200);
    const r = JSON.parse(await p.eval(`(() => {
      const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false);
      window.__landingStageEvents = [];
      const T0 = st.time;
      const vpY = Math.round(__landingStage.env.viewport().y);
      const hdr = __landingStage.layout.header;
      const o = { overlap: 0, act: 0, travel: 0, stolen: 0, probes: 0, under: 0, ledges: {}, where: {} };
      const buttons = [...document.querySelectorAll('a[href], button')].map(e => e.getBoundingClientRect()).filter(q => q.width && q.height && q.top + q.height / 2 > 0 && q.top + q.height / 2 < innerHeight);
      const seen = new Set();
      const N = Math.round(${Number(simSecs)} * 12);
      for (let i = 0; i < N; i++) {
        st.advance(1 / 12);
        const vs = st.visitors();
        const boxes = [...document.querySelectorAll('.ms-char')].map(el => { let l = 1e9, t = 1e9, r = -1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bb = Math.max(bb, q.bottom); } return { x: l, y: t, w: r - l, h: bb - t }; });
        const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
        if (boxes.length === 2 && boxes[0].w > 0 && boxes[1].w > 0 && !vs.some(v => v.mode === 'duet' || v.mode === 'duet-walk')
          && inter(boxes[0], boxes[1]) > 0.15 * Math.min(boxes[0].w * boxes[0].h, boxes[1].w * boxes[1].h)) o.overlap++;
        if (boxes.some(q => q.y + q.h > 0 && q.y < hdr - 1 && q.w > 0)) o.under++;
        if (boxes.some(q => q.y + q.h > 0 && q.y < 72 && q.w > 0)) o.underBar = (o.underBar || 0) + 1;
        for (const v of vs) {
          if (v.mode === 'act' || v.mode === 'duet') o.act++; else if (v.mode === 'enter' || v.mode === 'exit') o.travel++;
          const k = v.slug + '@' + v.ledge; if (!seen.has(k)) { seen.add(k); o.ledges[v.ledge] = (o.ledges[v.ledge] || 0) + 1; }
        }
        for (const k of [...seen]) if (!vs.some(v => v.slug + '@' + v.ledge === k)) seen.delete(k);
        if (i % 3 === 0) for (const q of buttons) for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.3, 0.7]) {
          const e = document.elementFromPoint(q.left + q.width * fx, q.top + q.height * fy); o.probes++;
          if (e && e.closest && e.closest('.ms-char')) { o.stolen++; const key = Math.round(q.left) + ',' + Math.round(q.top) + ' ' + vs.map(v => v.slug + '@' + v.ledge + ':' + v.mode).join('+'); o.where[key] = (o.where[key] || 0) + 1; }
        }
      }
      const ev = window.__landingStageEvents || [];
      o.meets = ev.filter(e => e.type === 'meet').length;
      o.greets = ev.filter(e => e.type === 'act' && e.act === 'greet').length;
      const fm = ev.find(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
      o.firstMeetOrGreet = fm ? +(fm.t - T0).toFixed(1) : null;
      o.acts = {}; for (const e of ev) if (e.type === 'act') o.acts[e.act] = (o.acts[e.act] || 0) + 1;
      o.vpY = vpY;
      // the header's drawn bar ends at its pen line (HEADER_STROKE_Y ≈ 73): count what reaches above that apart
      o.acting = Math.round(100 * o.act / Math.max(1, o.act + o.travel)) + '%';
      delete o.act; delete o.travel;
      st.resume();
      return JSON.stringify(o);
    })()`));
    out.sim.push({ scroll: y, ...r });
  }
  out.errors = p.errors.filter(e => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
} finally { await b.close(); }
writeFileSync(`landing/live/${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));

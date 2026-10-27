// check.mjs — the landing stage after the round-4 review fixes, on the running dev server.
//   node check.mjs <width> <height> <light|dark> [realSecs=20]
// Records: when the stage and its first visitor came, what one measure costs and whether it asks the browser's path
// geometry, frames while nobody is on stage, characters under the fixed header (live, and after a scroll that leaves
// one mostly under it), stolen clicks, horizontal scroll, console errors; screenshots of the first screen.
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '1440', h = '900', theme = 'light', realSecs = '20'] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const mobile = W < 1024, dpr = W < 1024 ? 2 : 1;
const tag = `${W}x${H}-${theme}`;
mkdirSync('shots', { recursive: true });
const b = await launch();
const out = { tag };
try {
  const t0 = Date.now();
  const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile, dpr, dark: theme === 'dark' });
  // count the browser's path walks from the very start
  await p.eval(`(() => { window.__gpal = 0; const f = SVGGeometryElement.prototype.getPointAtLength; SVGGeometryElement.prototype.getPointAtLength = function (...a) { window.__gpal++; return f.apply(this, a); }; return 1; })()`);
  let ready = null;
  for (let i = 0; i < 1200; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) { ready = Date.now() - t0; break; } await sleep(50); }
  out.stageAtMs = ready;
  out.preset = await p.eval('__landingStage.preset.name + " " + __landingStage.preset.unitHeight');
  out.places = await p.eval('__landingStage.layout.ledges.length');
  // ---- one measure, timed (the review: 249–282 ms at 1440, 228–240 at 834, 15–24 at 390)
  out.measureMs = JSON.parse(await p.eval(`(() => { const t = []; for (let i = 0; i < 5; i++) { const a = performance.now(); __landingStage.measure(); t.push(+(performance.now() - a).toFixed(1)); } return JSON.stringify(t); })()`));
  out.getPointAtLength = await p.eval('window.__gpal');
  // ---- real time
  const SAMPLE = `(() => {
    const hdr = __landingStage.layout.header;
    const chars = [...document.querySelectorAll('.ms-char')];
    const boxes = chars.map(el => { let l = 1e9, t = 1e9, r = -1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bb = Math.max(bb, q.bottom); } return { l, t, r, b: bb, op: getComputedStyle(el).opacity }; });
    const under = boxes.filter(q => q.b > 0 && q.t < hdr - 1 && q.l < innerWidth && q.r > 0).length;
    let stolen = 0, probes = 0;
    for (const e of document.querySelectorAll('a[href], button')) {
      const q = e.getBoundingClientRect(); if (!q.width || !q.height) continue;
      const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue;
      probes++;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit.closest && hit.closest('.ms-char')) stolen++;
    }
    const incomplete = chars.reduce((n, el) => n + [...el.querySelectorAll('img')].filter(im => !im.complete).length, 0);
    const vs = __landingStage.stage ? __landingStage.stage.visitors() : [];
    return JSON.stringify({ n: chars.length, under, stolen, probes, incomplete, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      vs: vs.map(v => ({ slug: v.slug, ledge: v.ledge, mode: v.mode, inView: v.y > scrollY + hdr && v.y - v.h < scrollY + innerHeight })) });
  })()`;
  const rt = { samples: 0, under: 0, stolen: 0, probes: 0, overflow: 0, incompleteShown: 0, firstVisitorS: null, firstWhere: null, maxChars: 0 };
  const start = Date.now();
  const shots = new Set([6, 12, Number(realSecs) - 2]);
  while ((Date.now() - start) / 1000 < Number(realSecs)) {
    const s = JSON.parse(await p.eval(SAMPLE));
    rt.samples++; rt.under += s.under ? 1 : 0; rt.stolen += s.stolen; rt.probes += s.probes; rt.maxChars = Math.max(rt.maxChars, s.n);
    if (s.incomplete) rt.incompleteShown++;
    if (s.sw > s.cw) rt.overflow++;
    if (s.vs.length && rt.firstVisitorS == null) { rt.firstVisitorS = +((Date.now() - t0) / 1000).toFixed(1); rt.firstWhere = `${s.vs[0].slug}@${s.vs[0].ledge} inView=${s.vs[0].inView}`; }
    const el = Math.round((Date.now() - start) / 1000);
    if (shots.has(el)) { shots.delete(el); writeFileSync(`shots/${tag}-first-${el}s.png`, await p.shot()); }
    await sleep(150);
  }
  out.realtime = rt;
  out.events = JSON.parse(await p.eval(`JSON.stringify((window.__landingStageEvents || []).filter(e => e.type === 'enter' || e.type === 'meet' || (e.type === 'act' && (e.act === 'greet' || e.pair))).map(e => e.type + ':' + (e.act || e.how || '') + ':' + e.slug + '@' + (e.ledge || '')))`));
  // ---- frames while nobody is on stage: over 25 s of the stage left alone, the engine's frames in the stretches
  // when nobody was on it (the review: 18–24 a second)
  out.idle = JSON.parse(await p.eval(`(async () => {
    const st = __landingStage.stage;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let emptySecs = 0, emptyFrames = 0, busySecs = 0, busyFrames = 0;
    let n = st.stats().n, was = st.visitors().length === 0, at = performance.now();
    for (let i = 0; i < 250; i++) {
      await sleep(100);
      const now = performance.now(), m = st.stats().n, empty = st.visitors().length === 0;
      if (empty && was) { emptySecs += (now - at) / 1000; emptyFrames += m - n; }
      else if (!empty && !was) { busySecs += (now - at) / 1000; busyFrames += m - n; }
      n = m; was = empty; at = now;
    }
    return JSON.stringify({ emptySecs: +emptySecs.toFixed(1), framesPerEmptySec: +(emptyFrames / Math.max(emptySecs, 0.01)).toFixed(2),
      busySecs: +busySecs.toFixed(1), framesPerBusySec: +(busyFrames / Math.max(busySecs, 0.01)).toFixed(1) });
  })()`));
  // ---- scroll a visitor mostly under the header: it must go (M1)
  out.scrollAway = JSON.parse(await p.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const st = __landingStage.stage; const hdr = __landingStage.layout.header;
    window.scrollTo({ top: 0, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'));
    await sleep(200);
    let v = null;
    for (let i = 0; i < 40; i++) {   // a visitor standing on a stand spot or edge (feet = its place) in the first screen
      const ok = st.visitors().find(x => x.mode === 'act' && /^(qr-point|badges|badge-l|badge-r|headline-l|headline-r|pill-top|avatars-end|hero-wave)$/.test(x.ledge));
      if (ok) { v = ok; break; }
      st.visit({ ledge: ['headline-l', 'pill-top', 'hero-wave', 'badge-l', 'badges'][i % 5] });
      await sleep(2500);
    }
    if (!v) return JSON.stringify({ skipped: 'no standing visitor' });
    const view = __landingStage.env.viewport();
    const viewTopOffset = view.y - scrollY;   // header + clear
    const target = Math.round(v.y - 0.4 * v.h - viewTopOffset);   // 40% of it below the view's top
    window.scrollTo({ top: target, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'));
    const modes = []; let underLater = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const me = st.visitors().find(x => x.slug === v.slug);
      modes.push(me ? me.mode : 'gone');
      if (i >= 30) {
        const el = [...document.querySelectorAll('.ms-char')];
        for (const c of el) { let t = 1e9, bb = -1e9; for (const im of c.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; t = Math.min(t, q.top); bb = Math.max(bb, q.bottom); } if (bb > 0 && t < hdr - 1) underLater++; }
      }
    }
    return JSON.stringify({ who: v.slug + '@' + v.ledge, scrolledTo: target, modes: [...new Set(modes)].join('>'), underAfter3s: underLater });
  })()`));
  await p.eval(`window.scrollTo({ top: 0, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'))`);
  // ---- reduced motion: the still one, scrolled to the page's foot, is wholly below the header
  await p.setMedia({ reduced: true });
  await sleep(400);
  out.reduced = JSON.parse(await p.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const hdr = __landingStage.layout.header; const res = [];
    for (const y of [document.documentElement.scrollHeight - innerHeight, Math.round(document.documentElement.scrollHeight * 0.45), 0]) {
      window.scrollTo({ top: y, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'));
      await sleep(700);
      const vs = __landingStage.stage.visitors();
      const el = document.querySelector('.ms-char');
      let t = null; if (el) { t = 1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (q.width) t = Math.min(t, q.top); } }
      res.push({ y, n: vs.length, who: vs[0] ? vs[0].slug + '@' + vs[0].ledge : null, topBelowHeader: t == null ? null : Math.round(t - hdr) });
    }
    return JSON.stringify(res);
  })()`));
  await p.setMedia({ reduced: false });
  out.errors = p.errors;
  await p.close();
} catch (e) {
  out.error = String(e && e.stack || e);
} finally {
  await b.close();
}
writeFileSync(`shots/${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

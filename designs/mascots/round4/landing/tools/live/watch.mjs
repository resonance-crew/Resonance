// watch.mjs — a reviewer's look at the landing stage on the dev server (read-only).
//   node watch.mjs <W> <H> <light|dark> <zh-TW|en> <reduced 0|1> [touch 0|1 (default: W<1024)] [simSecs=120] [positions=hero,feed,feed2,cta,footer]
// Real time: the first screen for 24 s (frames every 1 s, metrics every 0.5 s), then a slow scroll to the foot.
// Simulated (stage.advance 1/12 s) at each scroll position: metrics every frame, a frame every 1 s for the first 40 s,
// and for each such frame a second shot with the stage hidden, diffed inside the page's words and controls.
import { launch } from '../cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/ncchen/Documents/Resonance/package.json');
const sharp = require('sharp');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w = '1440', h = '900', theme = 'light', loc = 'zh-TW', red = '0', touchArg, simArg = '120', posArg = 'hero,feed,feed2,cta,footer'] = process.argv.slice(2);
const W = Number(w), H = Number(h), reduced = red === '1';
const touch = touchArg == null || touchArg === '' ? W < 1024 : touchArg === '1';
const dpr = W < 640 ? 2 : 1;
const SIM = Number(simArg);
const tag = `${W}x${H}-${theme}-${loc}${reduced ? '-reduced' : ''}${touch && W >= 1024 ? '-touch' : ''}`;
const OUT = `/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live/${tag}`;
mkdirSync(OUT, { recursive: true });

const b = await launch();
const out = { tag, W, H, theme, loc, reduced, touch, dpr };
let p;
async function ev(js, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try { return await p.eval(js); } catch (e) { if (i === tries - 1) throw e; await sleep(1500); }
  }
}
async function waitStage() {
  for (let i = 0; i < 600; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)').catch(() => false)) return true; await sleep(50); }
  return false;
}
const BOXES = `(() => [...document.querySelectorAll('.ms-char')].map(el => { let l = 1e9, t = 1e9, r = -1e9, bb = -1e9; for (const im of el.querySelectorAll('img')) { if (getComputedStyle(im).visibility === 'hidden' || /shadow/.test(im.src)) continue; const q = im.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bb = Math.max(bb, q.bottom); } return { x: l, y: t, w: r - l, h: bb - t }; }))`;
const SAMPLE = `(() => {
  const L = __landingStage.layout, hdr = L.header;
  const boxes = ${BOXES}();
  const under = boxes.filter(q => q.w > 0 && q.y + q.h > 0 && q.y < hdr - 1 && q.x < innerWidth && q.x + q.w > 0).length;
  let stolen = 0, probes = 0; const where = [];
  for (const e of document.querySelectorAll('a[href], button')) {
    const q = e.getBoundingClientRect(); if (!q.width || !q.height) continue;
    const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    if (cx < 0 || cx > innerWidth || cy < hdr || cy > innerHeight) continue;
    probes++;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit.closest && hit.closest('.ms-char')) { stolen++; where.push((e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 16)); }
  }
  const vs = __landingStage.stage ? __landingStage.stage.visitors() : [];
  return JSON.stringify({ n: boxes.length, under, stolen, probes, where, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, scroll: scrollY,
    vs: vs.map(v => ({ slug: v.slug, ledge: v.ledge, mode: v.mode, x: Math.round(v.x), y: Math.round(v.y), h: Math.round(v.h), inView: v.y > scrollY + hdr && v.y - v.h < scrollY + innerHeight })) });
})()`;
// the page's words (glyph boxes) and its small controls, in viewport px, below the header
const RECTS = `(() => {
  const hdr = __landingStage.layout.header; const text = [], ctrl = [];
  const range = document.createRange(); const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = wk.nextNode())) { if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || el.closest('[data-landing-stage]') || el.closest('header')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    range.selectNodeContents(n); for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1 && r.bottom > hdr && r.top < innerHeight && r.right > 0 && r.left < innerWidth) text.push([r.left, r.top, r.width, r.height, n.textContent.trim().slice(0, 12)]); }
  for (const e of document.querySelectorAll('a[href], button, [data-mascot="qr"], [data-mascot="avatars"]')) { if (e.closest('header')) continue; const r = e.getBoundingClientRect(); if (r.width > 1 && r.height > 1 && r.height < 140 && r.bottom > hdr && r.top < innerHeight) ctrl.push([r.left, r.top, r.width, r.height, (e.textContent || e.getAttribute('aria-label') || e.dataset.mascot || '').trim().slice(0, 12)]); }
  return JSON.stringify({ text, ctrl });
})()`;
async function raw(png) { const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height, c: info.channels }; }
function diffIn(a, b2, rects, s, inkOnly) {
  const hits = [];
  for (const [x, y, w2, h2, label] of rects) {
    let n = 0;
    const x0 = Math.max(0, Math.floor(x * s)), y0 = Math.max(0, Math.floor(y * s)), x1 = Math.min(a.w, Math.ceil((x + w2) * s)), y1 = Math.min(a.h, Math.ceil((y + h2) * s));
    if (x1 <= x0 || y1 <= y0) continue;
    let bg = null;
    if (inkOnly) {   // the rect's background: its most common colour (16 levels a channel) in the shot without the stage
      const hist = new Map();
      for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) { const i = (yy * b2.w + xx) * b2.c; const k = (b2.data[i] >> 4) << 8 | (b2.data[i + 1] >> 4) << 4 | (b2.data[i + 2] >> 4); hist.set(k, (hist.get(k) || 0) + 1); }
      let best = 0, bk = 0; for (const [k, v] of hist) if (v > best) { best = v; bk = k; }
      bg = [((bk >> 8) & 15) * 16 + 8, ((bk >> 4) & 15) * 16 + 8, (bk & 15) * 16 + 8];
    }
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * a.w + xx) * a.c;
      if (bg && Math.abs(b2.data[i] - bg[0]) + Math.abs(b2.data[i + 1] - bg[1]) + Math.abs(b2.data[i + 2] - bg[2]) < 90) continue;   // not the words' ink
      if (Math.abs(a.data[i] - b2.data[i]) > 48 || Math.abs(a.data[i + 1] - b2.data[i + 1]) > 48 || Math.abs(a.data[i + 2] - b2.data[i + 2]) > 48) n++;
    }
    const px = n / (s * s);
    if (px >= 6) hits.push({ label, px: Math.round(px), rect: [Math.round(x), Math.round(y), Math.round(w2), Math.round(h2)] });
  }
  return hits;
}
async function settleImgs() { await ev(`Promise.all([...document.querySelectorAll('.ms-char img')].map(i => i.decode().catch(() => {}))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`); }

try {
  const t0 = Date.now();
  p = await b.open(`http://localhost:3000/${loc}`, { width: W, height: H, mobile: touch, dpr, dark: theme === 'dark', reduced });
  const loadedMs = Date.now() - t0;
  const ok = await waitStage();
  out.stageReadyMs = ok ? Date.now() - t0 : null;
  out.loadedMs = loadedMs;
  if (!ok) throw new Error('no stage');
  out.preset = await ev('__landingStage.preset.name + " " + __landingStage.preset.unitHeight');
  out.ledges = await ev('__landingStage.layout.ledges.map(l => l.id).join(" ")');
  out.header = await ev('__landingStage.layout.header');
  out.qrShown = await ev(`(() => { const q = document.querySelector('[data-mascot="qr"]'); if (!q) return false; const r = q.getBoundingClientRect(); return r.width > 0 && getComputedStyle(q).display !== 'none'; })()`);
  out.stageClass = await ev(`(() => { const s = document.querySelector('.ms-stage'); return s ? s.className + ' | dim=' + (s.style.getPropertyValue('--ms-dim') || '-') + ' | filter=' + getComputedStyle(s).filter : 'none'; })()`);

  // ---- real time: the first screen
  const rt = { samples: 0, under: 0, stolen: 0, probes: 0, where: {}, widthOverflow: 0, firstVisitorFromNavS: null, firstInViewFromNavS: null, firstWhere: null, visitorsSeen: [], maxChars: 0, framesWith2: 0, framesWith1: 0, framesWith0: 0 };
  const start = Date.now();
  const seen = new Set();
  let frame = 0;
  const realFirst = reduced ? 8 : 24;
  while ((Date.now() - start) / 1000 < realFirst) {
    const s = JSON.parse(await ev(SAMPLE));
    rt.samples++; rt.under += s.under ? 1 : 0; rt.stolen += s.stolen; rt.probes += s.probes; rt.maxChars = Math.max(rt.maxChars, s.n);
    for (const k of s.where) rt.where[k] = (rt.where[k] || 0) + 1;
    if (s.sw !== s.cw) rt.widthOverflow++;
    const inv = s.vs.filter(v => v.inView);
    if (inv.length === 0) rt.framesWith0++; else if (inv.length === 1) rt.framesWith1++; else rt.framesWith2++;
    if (s.vs.length && rt.firstVisitorFromNavS == null) rt.firstVisitorFromNavS = +((Date.now() - t0) / 1000).toFixed(1);
    if (inv.length && rt.firstInViewFromNavS == null) { rt.firstInViewFromNavS = +((Date.now() - t0) / 1000).toFixed(1); rt.firstWhere = inv[0].slug + '@' + inv[0].ledge; }
    for (const v of s.vs) { const k = v.slug + '@' + v.ledge; if (!seen.has(k)) { seen.add(k); rt.visitorsSeen.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${k} h${v.h}`); } }
    const el = (Date.now() - start) / 1000;
    if (el >= frame) { await sharp(await p.shot()).jpeg({ quality: 78 }).toFile(`${OUT}/real-${String(frame).padStart(2, '0')}.jpg`).catch(() => {}); frame++; }
    await sleep(250);
  }
  out.realFirst = rt;
  out.realEvents = JSON.parse(await ev(`JSON.stringify((window.__landingStageEvents || []).map(e => (+e.t).toFixed(1) + ' ' + e.type + ':' + (e.act || e.how || '') + (e.with ? '+' + e.with : '') + '@' + (e.ledge || '') + ' ' + (e.slug || e.who || '')))`));

  if (reduced) {
    // still: the transforms of the one character, 2.5 s apart; then scroll to the middle and wait for it to move into view
    const TF = `JSON.stringify({ tf: [...document.querySelectorAll('.ms-char')].map(c => c.style.transform + '|' + [...c.querySelectorAll('img')].map(i => i.style.transform).join(',')), vs: __landingStage.stage.visitors().map(v => v.slug + '@' + v.ledge + ':' + v.mode), scroll: scrollY })`;
    const a = JSON.parse(await ev(TF)); await sleep(2500); const c = JSON.parse(await ev(TF));
    out.reducedTop = { a: a.vs, still: JSON.stringify(a.tf) === JSON.stringify(c.tf), n: a.tf.length };
    writeFileSync(`${OUT}/reduced-top.png`, await p.shot());
    const marks = [0.3, 0.55, 0.8, 1];
    out.reducedScroll = [];
    for (const m of marks) {
      await ev(`window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - innerHeight) * ${m}), behavior: 'instant' })`);
      await sleep(1200);
      const s = JSON.parse(await ev(SAMPLE)); const t1 = JSON.parse(await ev(TF)); await sleep(1500); const t2 = JSON.parse(await ev(TF));
      out.reducedScroll.push({ at: m, n: s.n, vs: s.vs, still: JSON.stringify(t1.tf) === JSON.stringify(t2.tf), stolen: s.stolen, under: s.under });
      writeFileSync(`${OUT}/reduced-${Math.round(m * 100)}.png`, await p.shot());
    }
    out.errors = p.errors.filter(e => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]|csp-report|Content Security Policy|img\.resonance/.test(e));
    writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out));
    await b.close();
    process.exit(0);
  }

  // ---- real time: a slow scroll to the foot (a visitor's read of the page)
  const scr = { steps: [] };
  const pageH = await ev('document.documentElement.scrollHeight');
  let y = 0, k = 0;
  while (y < pageH - H) {
    y = Math.min(pageH - H, y + Math.round(H * 0.45));
    await ev(`window.scrollTo({ top: ${y}, behavior: 'smooth' })`);
    await sleep(2600);
    const s = JSON.parse(await ev(SAMPLE));
    scr.steps.push({ y, n: s.n, inView: s.vs.filter(v => v.inView).map(v => v.slug + '@' + v.ledge + ':' + v.mode), under: s.under, stolen: s.stolen, sw: s.sw - s.cw });
    await sharp(await p.shot()).jpeg({ quality: 78 }).toFile(`${OUT}/scroll-${String(k++).padStart(2, '0')}.jpg`);
  }
  out.realScroll = scr;

  // ---- simulated
  const POS = {
    hero: '0',
    feed: `(() => { const c = document.querySelector('[data-mascot="feed-heading"]'); return c ? Math.round(c.getBoundingClientRect().top + scrollY - 140) : 900; })()`,
    feed2: `(() => { const cs = [...document.querySelectorAll('[data-card-id]')]; const c = cs[Math.min(cs.length - 1, ${W >= 1024 ? 3 : W >= 640 ? 2 : 2})]; return c ? Math.round(c.getBoundingClientRect().top + scrollY - innerHeight * 0.35) : 1800; })()`,
    cta: `(() => { const c = document.querySelector('[data-mascot-zone="cta"]'); return c ? Math.round(c.getBoundingClientRect().top + scrollY - innerHeight * 0.35) : 2500; })()`,
    footer: 'document.documentElement.scrollHeight - innerHeight',
  };
  out.sim = [];
  for (const pos of posArg.split(',')) {
    const yy = await ev(POS[pos]);
    await ev(`window.scrollTo({ top: ${yy}, behavior: 'instant' }); window.dispatchEvent(new Event('scroll'))`);
    await sleep(400);
    await ev(`(() => { const st = __landingStage.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); st.refresh(); window.__landingStageEvents = []; window.__T0 = st.time; return 1; })()`);
    const rects = JSON.parse(await ev(RECTS));
    const o = { pos, scroll: yy, overlap: 0, under: 0, stolen: 0, probes: 0, where: {}, act: 0, travel: 0, sw: 0, occ: [0, 0, 0], ledges: {}, sizes: {}, textHits: [], ctrlHits: [] };
    const STEP = `(() => {
      const st = __landingStage.stage; const L = __landingStage.layout, hdr = L.header; const res = { overlap: 0, under: 0, stolen: 0, probes: 0, where: {}, act: 0, travel: 0, sw: 0, occ: [0, 0, 0], ledges: {}, sizes: {} };
      const ctrls = [...document.querySelectorAll('a[href], button')].map(e => e.getBoundingClientRect()).filter(q => q.width && q.height && q.top + q.height / 2 > hdr && q.top + q.height / 2 < innerHeight);
      for (let i = 0; i < 12; i++) {
        st.advance(1 / 12);
        const vs = st.visitors(); const boxes = ${BOXES}();
        const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
        if (boxes.length === 2 && boxes[0].w > 0 && boxes[1].w > 0 && !vs.some(v => v.mode === 'duet' || v.mode === 'duet-walk') && inter(boxes[0], boxes[1]) > 0.15 * Math.min(boxes[0].w * boxes[0].h, boxes[1].w * boxes[1].h)) res.overlap++;
        if (boxes.some(q => q.w > 0 && q.y + q.h > 0 && q.y < hdr - 1 && q.x < innerWidth && q.x + q.w > 0)) res.under++;
        const inv = vs.filter(v => v.y > scrollY + hdr && v.y - v.h < scrollY + innerHeight).length; res.occ[Math.min(2, inv)]++;
        for (const v of vs) { if (v.mode === 'act' || v.mode === 'duet') res.act++; else if (v.mode === 'enter' || v.mode === 'exit') res.travel++; res.ledges[v.slug + '@' + v.ledge] = 1; res.sizes[v.slug] = Math.round(v.h); }
        if (i % 3 === 0) for (const q of ctrls) for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.35, 0.65]) { const e = document.elementFromPoint(q.left + q.width * fx, q.top + q.height * fy); res.probes++; if (e && e.closest && e.closest('.ms-char')) { res.stolen++; const key = Math.round(q.left) + ',' + Math.round(q.top); res.where[key] = (res.where[key] || 0) + 1; } }
      }
      if (document.documentElement.scrollWidth !== document.documentElement.clientWidth) res.sw++;
      res.t = +(st.time - window.__T0).toFixed(1);
      res.vs = st.visitors().map(v => v.slug + '@' + v.ledge + ':' + v.mode);
      return JSON.stringify(res);
    })()`;
    for (let sec = 0; sec < SIM; sec++) {
      const r = JSON.parse(await ev(STEP));
      for (const kk of ['overlap', 'under', 'stolen', 'probes', 'act', 'travel', 'sw']) o[kk] += r[kk];
      for (let j = 0; j < 3; j++) o.occ[j] += r.occ[j];
      for (const kk in r.where) o.where[kk] = (o.where[kk] || 0) + r.where[kk];
      for (const kk in r.ledges) o.ledges[kk] = (o.ledges[kk] || 0) + 1;
      Object.assign(o.sizes, r.sizes);
      if (sec < 40 && r.vs.length) {
        await settleImgs();
        const A = await p.shot();
        await ev(`document.querySelector('[data-landing-stage]').style.visibility = 'hidden'`);
        await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
        const B = await p.shot();
        await ev(`document.querySelector('[data-landing-stage]').style.visibility = ''`);
        const ra = await raw(A), rb = await raw(B);
        const th = diffIn(ra, rb, rects.text, dpr, true), ch = diffIn(ra, rb, rects.ctrl, dpr, false);
        if (th.length || ch.length) await sharp(A).png().toFile(`${OUT}/hit-${pos}-${String(sec).padStart(3, '0')}.png`);
        const name = `${pos}-${String(sec).padStart(3, '0')}`;
        if (th.length) o.textHits.push({ sec, vs: r.vs, hits: th });
        if (ch.length) o.ctrlHits.push({ sec, vs: r.vs, hits: ch });
        await sharp(A).jpeg({ quality: 80 }).toFile(`${OUT}/sim-${name}.jpg`);
      }
    }
    const ev2 = JSON.parse(await ev(`JSON.stringify((window.__landingStageEvents || []).map(e => ({ t: +(e.t - window.__T0).toFixed(1), type: e.type, act: e.act, how: e.how, ledge: e.ledge, pair: e.pair, label: e.label })))`));
    o.meets = ev2.filter(e => e.type === 'meet').length;
    o.greets = ev2.filter(e => e.type === 'act' && e.act === 'greet').length;
    const fm = ev2.find(e => e.type === 'meet' || (e.type === 'act' && e.act === 'greet'));
    o.firstMeetOrGreet = fm ? fm.t : null;
    o.enters = ev2.filter(e => e.type === 'enter').length;
    const fe = ev2.find(e => e.type === 'enter'); o.firstEnter = fe ? fe.t : null;
    o.acts = {}; for (const e of ev2) if (e.type === 'act') o.acts[e.act] = (o.acts[e.act] || 0) + 1;
    o.hows = {}; for (const e of ev2) if (e.type === 'enter') o.hows[e.how] = (o.hows[e.how] || 0) + 1;
    o.acting = Math.round(100 * o.act / Math.max(1, o.act + o.travel)) + '%';
    const tot = o.occ[0] + o.occ[1] + o.occ[2];
    o.occPct = o.occ.map(x => Math.round(100 * x / tot) + '%').join('/');
    delete o.act; delete o.travel;
    out.sim.push(o);
    await ev('__landingStage.stage.resume()');
  }
  out.errors = p.errors.filter(e => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]|csp-report|Content Security Policy|img\.resonance/.test(e));
} catch (e) {
  out.fatal = String(e && e.stack || e);
} finally { await b.close(); }
writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag, preset: out.preset, ready: out.stageReadyMs, first: out.realFirst && out.realFirst.firstInViewFromNavS, fatal: out.fatal }));
process.exit(0);

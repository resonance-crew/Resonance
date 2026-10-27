// check.mjs — loads index.html (file://) in headless Chrome through ../kit/cdp.mjs and writes screenshots to checks/:
//   node check.mjs [name…]   desktop-light desktop-dark mobile-light mobile-dark meet phone-ui reduced poke pause
//                            greet hides acts reduced-phone
//                            (default: all). Prints console errors / failed loads, the stage's tick cost, rAF frame
//                            intervals and where the visitors stand.
//   node check.mjs spots <desktop|mobile>[-dark] "<ledge>:<slug>:<act+act>,…" <ms,ms,…> [out.png]
//                            one row per case, zoomed on the visitor at each time (e.g. "browse:card:lean")
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, 'checks');
mkdirSync(OUT, { recursive: true });
const URL0 = 'file://' + join(HERE, 'index.html');
const HOOK = `window.__log = []; const __l = (k, a) => window.__log.push(k + ': ' + [...a].map(String).join(' '));
  for (const k of ['error', 'warn']) { const o = console[k]; console[k] = (...a) => { __l(k, a); o.apply(console, a); }; }
  addEventListener('error', e => __l('error', [e.message || ('load failed: ' + (e.target && (e.target.src || e.target.href)))]), true);
  addEventListener('unhandledrejection', e => __l('rejection', [e.reason && e.reason.stack || e.reason]));`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(b, flags, { width = 1280, height = 1000, dpr = 1, mobile = false } = {}) {   // index.html with a console hook
  const p = await b.open('about:blank', { width, height, dpr, mobile });
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await p.send('Page.navigate', { url: URL0 + flags });
  for (let i = 0; i < 100; i++) { if (await p.eval('!!(window.__msp && window.__msp.stage)')) break; await sleep(50); }
  return p;
}
const visitors = p => p.eval('JSON.stringify(__msp.stage.visitors().map(v => [v.name, v.ledge, v.mode, Math.round(v.x), Math.round(v.y)]))');
async function frames(p, ms = 2500) {
  return p.eval(`new Promise(res => { const d = []; let last = performance.now(); const t0 = last; __msp.stage.resetStats();
    const f = now => { d.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(f); else { d.sort((a, b) => a - b);
      const s = __msp.stage.stats(); res({ frames: d.length, medianMs: +d[d.length >> 1].toFixed(2), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(2),
      tickAvgMs: +s.avgMs.toFixed(3), tickMaxMs: +s.max.toFixed(2), poseSteps: s.steps }); } };
    requestAnimationFrame(f); })`);
}
async function shotFrame(p, file) {   // the prototype's frame only (plus a margin)
  const r = await p.eval(`(() => { const e = document.querySelector('.msp-window, .msp-phone').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; })()`);
  writeFileSync(join(OUT, file), await p.shot({ clip: { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: r.height + 8 } }));
}

const runs = {
  async poke(b) {   // hover → a wave; click → a happy hop; a second click → shy, then off
    const p = await page(b, '?view=desktop&reduced=0&seed=3&at=hero-wave&who=tuck', { dpr: 2 });
    await sleep(5200);
    const box = async () => JSON.parse(await p.eval(`JSON.stringify((() => { const r = document.querySelector('.ms-char img[src$="/torso.png"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })())`));
    const status = () => p.eval('document.querySelector("[data-status]").innerText.split("\\n")[0]');
    const mouse = (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
    const shots = [], said = [];
    const shot = async c => shots.push(await p.shot({ clip: { x: c.x - c.w * 1.6, y: c.y - c.h * 1.5, width: c.w * 3.2, height: c.h * 2.7 } }));
    let c = await box();
    await mouse('mouseMoved', c.x + c.w * 1.2, c.y - c.h * 0.6, { button: 'none' }); await sleep(100);
    await mouse('mouseMoved', c.x + c.w * 0.3, c.y - c.h * 0.3, { button: 'none' }); await sleep(600); await shot(c); said.push(await status());
    for (const wait of [250, 600]) {
      c = await box(); await mouse('mousePressed', c.x, c.y, { clickCount: 1 }); await mouse('mouseReleased', c.x, c.y, { clickCount: 1 });
      await sleep(wait); await shot(c); said.push(await status()); await sleep(1200);
    }
    tile(shots, 3, join(OUT, 'poke.png'));
    return { said, errors: await p.eval('__log') };
  },
  async 'spot-meet'(b) {   // a guest walks up to someone standing at a spot (the avatar row's end), from its open side
    const p = await page(b, '?view=desktop&reduced=0&seed=5&at=avatars-end&who=tuck', { dpr: 2 });
    await sleep(5500);
    const ok = await p.eval('__msp.stage.meet("five")');
    const shots = [], said = [];
    for (const t of [2500, 4500, 6000, 7200, 8400, 10000]) {
      await sleep(t - (shots.length ? [2500, 4500, 6000, 7200, 8400, 10000][shots.length - 1] : 0));
      await shotFrame(p, '_tmp.png'); shots.push(readFileSync(join(OUT, '_tmp.png'))); said.push(await p.eval('document.querySelector("[data-status]").innerText.split("\\n")[0]'));
    }
    unlinkSync(join(OUT, '_tmp.png'));
    tile(shots, 2, join(OUT, 'spot-meet.png'));
    return { ok, said, errors: await p.eval('__log') };
  },
  async pause(b) {   // the clock stops while the tab is hidden or the stage is scrolled off screen; smooth-mode cost
    const p = await page(b, '?view=desktop&reduced=0&seed=3');
    await sleep(2000);
    return JSON.parse(await p.eval(`(async () => {
      const st = __msp.stage, sleep = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const ran = async () => { const t0 = st.time; await sleep(800); return +(st.time - t0).toFixed(2); };
      out.running = await ran();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
      out.hidden = await ran();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));
      out.visibleAgain = await ran();
      const sp = document.createElement('div'); sp.style.height = '4000px'; document.body.append(sp); scrollTo(0, 3500); await sleep(300);
      out.offScreen = await ran(); scrollTo(0, 0); await sleep(300); out.backOn = await ran(); sp.remove();
      st.setOptions({ fps: 0 }); st.resetStats(); await sleep(2000); const s = st.stats();
      out.smooth = { frames: s.n, avgMs: +s.avgMs.toFixed(3), maxMs: +s.max.toFixed(2) };
      return JSON.stringify(out); })()`));
  },
  async 'desktop-light'(b) { return timeline(b, '?view=desktop&theme=light&reduced=0&seed=3', 'desktop-light'); },
  async 'desktop-dark'(b) { return timeline(b, '?view=desktop&theme=dark&reduced=0&seed=8&scroll=1180', 'desktop-dark'); },
  async 'mobile-light'(b) { return timeline(b, '?view=mobile&theme=light&reduced=0&seed=5', 'mobile-light'); },
  async 'mobile-dark'(b) { return timeline(b, '?view=mobile&theme=dark&reduced=0&seed=11&scroll=4300', 'mobile-dark'); },
  async meet(b) {
    const p = await page(b, '?view=desktop&theme=light&reduced=0&seed=4&meet=1&ledges=0');
    const log = [];
    for (const [i, t] of [[1, 3500], [2, 6500], [3, 8200], [4, 9600], [5, 11000], [6, 13000]].map(([i, t], j, a) => [i, t - (j ? a[j - 1][1] : 0)])) {
      await sleep(t); await shotFrame(p, `meet-${i}.png`); log.push(await visitors(p));
    }
    return { visitors: log, status: await p.eval('document.querySelector("[data-status]").innerText'), errors: await p.eval('__log') };
  },
  async 'phone-ui'(b) {   // the page itself on a 390-wide phone: no sideways scroll, controls wrap
    const p = await page(b, '?reduced=0&seed=2', { width: 390, height: 844, dpr: 2, mobile: true });
    await sleep(3500);
    writeFileSync(join(OUT, 'phone-ui.png'), await p.shot({ full: true, scale: 0.5 }));
    return { scrollW: await p.eval('document.documentElement.scrollWidth'), view: await p.eval('__msp.view'), errors: await p.eval('__log') };
  },
  // greetings from afar: a guest comes to the place across (the phone's badge, the desktop headline) and they wave
  async greet(b) {
    const out = {};
    for (const [view, at, who, times] of [['mobile', 'badge-l', 'tuck', [1, 3, 5.5, 7, 8.2, 9.2, 10.2, 11.5]], ['desktop', 'headline-l', 'tag', [1, 3, 5.5, 7, 8.2, 9.2, 10.2, 11.5]]]) {
      const { p, shots } = await stepped(b, `?view=${view}&reduced=0`, { setup: `st.visit({ ledge: '${at}', slug: '${who}', acts: ['look'] }); st.advance(2.6); st.meet();`, times,
        frame: view === 'mobile' ? [0, 200, 390, 470] : [380, 120, 680, 260] });
      tile(shots, 4, join(OUT, `greet-${view}.png`));
      out[view] = { said: await p.eval('__said'), errors: await p.eval('__log') };
    }
    return out;
  },
  // a variant that hides parts: the tag turned round to its 「給：」 back shows no face (patched in when the rig
  // doesn't say data-hides yet), 摺摺's mitten lifts its own corner, 聆聆's written-over card keeps its face
  async hides(b) {
    const { p, shots, note } = await stepped(b, '?view=desktop&reduced=0&scroll=1050', {
      patch: `const tg = cast.find(c => c.slug === 'tag'), alt = tg && tg.manifest.parts.find(q => q.name === 'torso-alt');
        if (alt && !alt.hides) { alt.hides = 'face'; note = 'tag: hides patched in for the check (the rig has no data-hides yet)'; } else note = alt ? 'tag: hides from the rig: ' + alt.hides : 'no tag';`,
      setup: `st.visit({ ledge: 'card-1-top', slug: 'tag', acts: ['reveal', 'reveal'] });`, times: [1.4, 1.75, 2.2, 3.0, 3.8, 4.3, 4.6] });
    const two = await stepped(b, '?view=desktop&reduced=0&scroll=1050', { setup: `st.visit({ ledge: 'card-1-top', slug: 'tuck', acts: ['reveal'] });`, times: [1.4, 1.9, 2.4, 3.2, 3.9, 4.3, 4.6] });
    const three = await stepped(b, '?view=desktop&reduced=0&scroll=1050', { setup: `st.visit({ ledge: 'card-1-top', slug: 'card', acts: ['reveal'] });`, times: [1.4, 1.9, 2.4, 3.2, 3.9, 4.3, 4.6] });
    tile([...shots, ...two.shots, ...three.shots], 7, join(OUT, 'hides.png'));
    return { note, errors: [...await p.eval('__log'), ...await two.p.eval('__log')] };
  },
  // the acts the critic found unreadable at 120 px: read (a little book), write (a slip of paper held out), the touch
  // of mittens (碰碰手) with its joint hop, 聆聆's hat (lifted, or a nod that makes it hop)
  async acts(b) {
    const rows = [];
    const only = slugs => `for (let i = cast.length - 1; i >= 0; i--) if (!${JSON.stringify(slugs)}.includes(cast[i].slug)) cast.splice(i, 1);`;
    for (const [flags, setup, times, patch] of [
      ['?view=desktop&reduced=0&scroll=1050', `st.visit({ ledge: 'card-5-top', slug: 'tuck', acts: ['read'] });`, [1.6, 2.3, 3.2, 3.8, 4.4, 5.2]],
      ['?view=desktop&reduced=0&scroll=2500', `st.visit({ ledge: 'write', slug: 'card', acts: ['write'] });`, [2.9, 3.6, 4.6, 5.4, 5.9, 6.3]],
      ['?view=desktop&reduced=0&scroll=2300', `st.visit({ ledge: 'cta-wave', slug: 'tuck', acts: ['look', 'look', 'look'] }); st.advance(5); st.meet('five');`, [9.1, 9.45, 9.65, 9.85, 10.1, 10.6], only(['tuck', 'night'])],
      ['?view=desktop&reduced=0', `st.visit({ ledge: 'avatars-end', slug: 'card', acts: ['deco', 'deco', 'deco'] });`, [3, 3.5, 4.0, 5.2, 5.6, 6.0]],
    ]) rows.push(...(await stepped(b, flags, { setup, times, patch })).shots);
    tile(rows, 6, join(OUT, 'acts.png'));
    return {};
  },
  // reduced motion on a phone: one character, still, in the first screen; after a scroll it is somewhere in view
  async 'reduced-phone'(b) {
    const p = await page(b, '?view=mobile&reduced=1', { width: 600, height: 1300, dpr: 2 });
    await sleep(800); await shotFrame(p, '_r1.png');
    const a = await visitors(p);
    await p.eval('__msp.scrollToPage(1600)'); await sleep(900); await shotFrame(p, '_r2.png');
    const c = await visitors(p);
    tile([readFileSync(join(OUT, '_r1.png')), readFileSync(join(OUT, '_r2.png'))], 2, join(OUT, 'reduced-phone.png'));
    unlinkSync(join(OUT, '_r1.png')); unlinkSync(join(OUT, '_r2.png'));
    return { first: a, afterScroll: c, raf: await p.eval('__msp.stage.stats().n'), errors: await p.eval('__log') };
  },
  async reduced(b) {
    const p = await page(b, '?view=desktop&reduced=1');
    await sleep(1500); await shotFrame(p, 'reduced.png');
    const a = await visitors(p); await sleep(1500);
    return { visitors: a, same: a === await visitors(p), raf: await p.eval('__msp.stage.stats().n'), errors: await p.eval('__log') };
  },
};
// a stage of our own over the prototype's page, stepped by advance() (exact times): `setup` is JS run with `st` (the
// stage) and `F` (the frame); one picture per time, framed on the visitors (or `frame`: [x, y, w, h] in page px)
const TRAITS_JS = `{ tuck: { likes: ['read', 'reveal'] }, tag: { pace: 1.1, likes: ['reveal', 'wave'] }, card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
  dot: { likes: ['hop'], openStretch: true }, night: { pace: 0.7, naps: true, likes: ['nap', 'twinkle'] } }`;
async function stepped(b, flags, { setup, times, frame, patch = '', dpr = 2, scale = 1 }) {
  const p = await page(b, flags, { width: 1440, height: 1000, dpr });
  await sleep(150);
  const note = await p.eval(`(() => {
    __msp.stage.destroy();
    const F = __msp.frame, V = F.V, T = ${TRAITS_JS};
    const cast = MascotStage.CAST.map(c => ({ ...c, manifest: JSON.parse(JSON.stringify(c.manifest)), traits: T[c.slug] || {} }));
    let note = ''; ${patch}
    const st = MascotStage.createStage({ layer: F.page, ledges: V.ledges, content: V.content, unitHeight: V.unitHeight, theme: new URLSearchParams(location.search).get('theme') || 'light',
      reducedMotion: false, viewport: () => ({ x: 0, y: F.scroll.scrollTop / F.s, w: V.page.w, h: F.scroll.clientHeight / F.s }) }, cast, { seed: 7, autoplay: false, observe: false,
      onEvent: e => (window.__said = window.__said || []).push(e.t.toFixed(2) + ' ' + (e.label || e.act || e.type)) });
    window.__st = st; ${setup}
    return note; })()`);
  const shots = [];
  let t0 = 0;
  for (const t of times) {
    await p.eval(`__st.advance(${t - t0})`); t0 = t;
    const r = JSON.parse(await p.eval(`JSON.stringify((() => { const F = __msp.frame, sr = F.scroll.getBoundingClientRect(), s = F.s, top = F.scroll.scrollTop / s;
      let box = ${frame ? JSON.stringify(frame) : 'null'};
      if (!box) { const vs = __st.visitors(); if (!vs.length) return { x: sr.x, y: sr.y, width: sr.width, height: Math.min(sr.height, 500) };
        const x0 = Math.min(...vs.map(v => v.x)) - 150, x1 = Math.max(...vs.map(v => v.x)) + 150, y0 = Math.min(...vs.map(v => v.y - v.h)) - 50, y1 = Math.max(...vs.map(v => v.y)) + 40;
        box = [x0, y0, Math.max(300, x1 - x0), Math.max(230, y1 - y0)]; }
      return { x: sr.x + box[0] * s, y: sr.y + (box[1] - top) * s, width: box[2] * s, height: box[3] * s }; })())`));
    shots.push(await p.shot({ clip: r, scale }));
  }
  return { p, shots, note };
}
async function timeline(b, flags, name) {
  const p = await page(b, flags);
  const out = { visitors: [] };
  for (const [t, label] of [[3000, '3s'], [4000, '7s'], [5000, '12s']]) {
    await sleep(t); await shotFrame(p, `${name}-${label}.png`); out.visitors.push(await visitors(p));
  }
  out.frames = await frames(p);
  out.errors = await p.eval('__log');
  return out;
}

// a row of screenshots per case: "<ledge>:<slug>:<act+act>", zoomed on that visitor at each time
async function spots(b, view, cases, times, out) {
  const [v, theme = 'light'] = view.split('-'), shots = [], n = times.length;
  for (const c of cases) {
    const [at, who = '', acts = ''] = c.split(':');
    const p = await page(b, `?view=${v}&theme=${theme}&reduced=0&seed=3&at=${at}&who=${who}${acts ? '&do=' + acts : ''}`, { width: 1500, dpr: 2 });
    const t0 = Date.now();
    for (const t of times) {
      await sleep(Math.max(0, t - (Date.now() - t0)));
      const r = JSON.parse(await p.eval(`JSON.stringify((() => { const all = __msp.stage.visitors(), v = all.find(c => c.ledge === ${JSON.stringify(at)}) || all[0];
        const F = __msp.frame, r = F.scroll.getBoundingClientRect(), s = F.s, st = document.querySelector('[data-status]').innerText.split('\\n')[0];
        return v ? { x: r.x + v.x * s, y: r.y + v.y * s - F.scroll.scrollTop, s, st } : { x: r.x + r.width / 2, y: r.y + 300, s, st }; })())`));
      const w = 300 * r.s, h = 230 * r.s;
      shots.push(await p.shot({ clip: { x: r.x - w / 2, y: r.y - h * 0.72, width: w, height: h }, scale: 1.2 }));
      console.log(at, who, t, r.st);
    }
  }
  tile(shots, n, out);
}
function tile(pngs, cols, out) {   // python + PIL, as the kit does
  const dir = join(OUT, '_tiles'); mkdirSync(dir, { recursive: true });
  const files = pngs.map((b, i) => { const f = join(dir, `${i}.png`); writeFileSync(f, b); return f; });
  execFileSync('python3', ['-c', `import sys, os
from PIL import Image
n=int(sys.argv[1]); out=sys.argv[2]; fs=sys.argv[3:]; ims=[Image.open(f) for f in fs]
w=max(i.width for i in ims); h=max(i.height for i in ims); rows=(len(ims)+n-1)//n
o=Image.new('RGB',(w*n,h*rows),(255,255,255))
for i,im in enumerate(ims): o.paste(im,((i%n)*w,(i//n)*h))
o.save(out)
for f in fs: os.remove(f)
os.rmdir(os.path.dirname(fs[0]))`, String(cols), out, ...files]);
}

const args = process.argv.slice(2);
const b = await launch();
try {
  if (args[0] === 'spots') {
    await spots(b, args[1] || 'desktop', (args[2] || 'hero-wave:tuck:wave').split(','), (args[3] || '2500,5000').split(',').map(Number), args[4] || join(OUT, 'spots.png'));
  } else {
    for (const [name, fn] of Object.entries(runs)) {
      if (args.length && !args.includes(name)) continue;
      console.log(name, JSON.stringify(await fn(b), null, 0));
    }
  }
} finally { await b.close(); }

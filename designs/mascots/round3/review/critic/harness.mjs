// critic harness: opens the stage prototype, steps it deterministically (pause + advance) and captures frames.
import { launch } from '../../kit/cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const HERE = dirname(fileURLToPath(import.meta.url));
export const STAGE = join(HERE, '../../stage');
export const URL0 = 'file://' + join(STAGE, 'index.html');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOOK = `window.__log = []; const __l = (k, a) => window.__log.push(k + ': ' + [...a].map(String).join(' '));
  for (const k of ['error', 'warn']) { const o = console[k]; console[k] = (...a) => { __l(k, a); o.apply(console, a); }; }
  addEventListener('error', e => __l('error', [e.message || ('load failed: ' + (e.target && (e.target.src || e.target.href)))]), true);
  addEventListener('unhandledrejection', e => __l('rejection', [e.reason && e.reason.stack || e.reason]));
  window.__ev = [];
  new MutationObserver(() => { const s = document.querySelector('[data-status]'); if (!s) return; const t = s.innerText.split('\\n')[0]; const st = window.__msp && window.__msp.stage ? window.__msp.stage.time : -1; if (!window.__ev.length || window.__ev[window.__ev.length-1][1] !== t) window.__ev.push([+st.toFixed(2), t]); })
    .observe(document, { subtree: true, childList: true, characterData: true });`;
export async function browser() { return launch(); }
export async function proto(b, flags, { width = 1440, height = 1000, dpr = 2, mobile = false } = {}) {
  const p = await b.open('about:blank', { width, height, dpr, mobile });
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await p.send('Page.navigate', { url: URL0 + flags });
  for (let i = 0; i < 200; i++) { if (await p.eval('!!(window.__msp && window.__msp.stage)')) break; await sleep(25); }
  p.dpr = dpr;
  return p;
}
// the page's viewport rect (the .msp-scroll), and the scale s (page px → css px)
export async function geom(p) {
  return JSON.parse(await p.eval(`JSON.stringify((() => { const F = __msp.frame, r = F.scroll.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, s: F.s, top: F.scroll.scrollTop }; })())`));
}
export async function state(p) {
  return JSON.parse(await p.eval(`JSON.stringify({ t: +__msp.stage.time.toFixed(2), v: __msp.stage.visitors().map(v => ({ slug: v.slug, x: +v.x.toFixed(1), y: +v.y.toFixed(1), h: +v.h.toFixed(1), mode: v.mode, ledge: v.ledge })),
    status: document.querySelector('[data-status]').innerText.split('\\n')[0] })`));
}
export async function shotView(p, g, file, scale = 1) {
  const png = await p.shot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h }, scale });
  writeFileSync(file, png); return file;
}
export async function shotClip(p, clip, file, scale = 1) { writeFileSync(file, await p.shot({ clip, scale })); return file; }
export { mkdirSync, writeFileSync, join };

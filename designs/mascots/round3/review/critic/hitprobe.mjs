// do the characters' hit images (pointer-events:auto on the whole <img> box, transparent corners included) cover
// the page's buttons? elementFromPoint over a grid inside each control's rect, while a visitor acts beside it;
// and is the pixel under the hit transparent (alpha from the part PNG)?
import { browser, proto, sleep } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const A = JSON.parse(readFileSync(join(import.meta.dirname, '../../landing/anchors.json'), 'utf8'));
const cases = [['desktop', 'browse', 'tuck', 'lean+lean'], ['desktop', 'browse', 'tag', 'lean+point'], ['desktop', 'browse', 'card', 'lean+point'], ['desktop', 'write', 'card', 'beckon+write'], ['desktop', 'write', 'tag', 'beckon+write'],
  ['desktop', 'badges', 'card', 'point+wave'], ['desktop', 'badges', 'tag', 'point+wave'], ['desktop', 'qr-point', 'card', 'point+wave'], ['desktop', 'qr-point', 'tuck', 'point+wave'], ['desktop', 'avatars-end', 'card', 'wave+hop'],
  ['mobile', 'write', 'tuck', 'beckon+duck'], ['mobile', 'write', 'night', 'beckon+wave'], ['mobile', 'browse', 'card', 'lean+point'], ['mobile', 'browse', 'tag', 'lean+point']];
const b = await browser();
try {
  for (const [view, at, who, acts] of cases) {
    const V = A[view];
    const ctrls = [...(V.feedMore || []).slice(-1).map(r => ({ ...r, name: '瀏覽所有故事' })), ...(V.ctaButtons || []).map(r => ({ ...r, name: r.text })), ...(V.badges || []).map((r, i) => ({ ...r, name: 'badge' + i }))];
    const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=3`, { dpr: 1 });
    await p.eval('__msp.stage.pause()');
    await p.eval(`__msp.visitAt('${at}', '${who}', '${acts}')`); await p.eval('__msp.stage.pause()');
    const res = await p.eval(`(async () => {
      const st = __msp.stage, F = __msp.frame, ctrls = ${JSON.stringify(ctrls)}, out = {}, alphaCache = new Map();
      const alphaAt = async (img, cx, cy) => {   // alpha of the part image under client point (cx, cy)
        if (!alphaCache.has(img.src)) { const im = new Image(); im.src = img.src; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); alphaCache.set(img.src, { g, w: c.width, h: c.height }); }
        const { g, w, h } = alphaCache.get(img.src);
        const m = new DOMMatrix(getComputedStyle(img).transform === 'none' ? undefined : getComputedStyle(img).transform);
        // map client point into the img's own box: use the inverse of its full CTM via getBoxQuads-free approach: sample by elementsFromPoint only
        return null; };
      let who = '', acted = 0;
      for (let i = 0; i < 12 * 14; i++) { st.advance(1/12);
        const vs = st.visitors(); if (!vs.length) break; if (vs[0].mode !== 'act') continue; acted++;
        const sr = F.scroll.getBoundingClientRect(), s = F.s, top = F.scroll.scrollTop;
        for (const c of ctrls) {
          let hit = 0, n = 0;
          for (let gx = 0.04; gx < 1; gx += 0.08) for (let gy = 0.1; gy < 1; gy += 0.2) {
            const px = sr.left + (c.x + c.w * gx) * s, py = sr.top + (c.y + c.h * gy) * s - top;
            if (py < sr.top || py > sr.bottom) continue; n++;
            const el = document.elementFromPoint(px, py); if (el && el.classList.contains('ms-hit')) { hit++; out[c.name + ' ← ' + el.src.split('/').slice(-1)[0]] = (out[c.name + ' ← ' + el.src.split('/').slice(-1)[0]] || 0) + 1; }
          }
          if (hit) out[c.name + ' frames'] = (out[c.name + ' frames'] || 0) + 1;
        }
      }
      out.actFrames = acted; return out; })()`);
    console.log(view, at, who, acts, JSON.stringify(res));
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }

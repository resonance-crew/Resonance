// motion.mjs — reduced motion (one still character in view, staying still, moved into view when scrolling stops,
// toggled live both ways) and switching widths live (presets, sizes, no errors, no horizontal scroll).
//   node motion.mjs reduced <w> <h>      node motion.mjs switch
import { launch } from './cdp4.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [mode = 'reduced', w = '1440', h = '900'] = process.argv.slice(2);
mkdirSync('landing/motion', { recursive: true });
const STATE = `JSON.stringify((() => {
  const chars = [...document.querySelectorAll('.ms-char')];
  const hdr = __landingStage.layout.header;
  return { preset: __landingStage.preset.name, unit: __landingStage.preset.unitHeight, n: chars.length,
    tf: chars.map(c => c.style.transform), vs: __landingStage.stage.visitors().map(v => ({ slug: v.slug, mode: v.mode, ledge: v.ledge, h: Math.round(v.h),
    inView: v.y > scrollY + hdr && v.y - v.h * 0.75 < scrollY + innerHeight })), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, scroll: scrollY };
})())`;
const b = await launch();
const out = { mode };
try {
  if (mode === 'reduced') {
    const W = Number(w), H = Number(h);
    const p = await b.open('http://localhost:3000/zh-TW', { width: W, height: H, mobile: W < 1024, dpr: W < 640 ? 2 : 1, reduced: true });
    for (let i = 0; i < 400; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
    await sleep(1500);
    const a = JSON.parse(await p.eval(STATE));
    await sleep(2500);
    const b2 = JSON.parse(await p.eval(STATE));
    writeFileSync(`landing/motion/reduced-${W}-top.png`, await p.shot());
    out.top = { first: a, later: b2, still: JSON.stringify(a.tf) === JSON.stringify(b2.tf) };
    await p.eval(`window.scrollTo({ top: Math.round(document.documentElement.scrollHeight * 0.45), behavior: 'instant' })`);
    await sleep(900);
    const c = JSON.parse(await p.eval(STATE));
    writeFileSync(`landing/motion/reduced-${W}-mid.png`, await p.shot());
    out.afterScroll = c;
    await p.setMedia({ reduced: false });
    await sleep(5000);
    out.motionOn = JSON.parse(await p.eval(STATE));
    await p.setMedia({ reduced: true });
    await sleep(800);
    out.motionOffAgain = JSON.parse(await p.eval(STATE));
    out.errors = p.errors;
  } else {
    const p = await b.open('http://localhost:3000/zh-TW', { width: 1440, height: 900 });
    for (let i = 0; i < 400; i++) { if (await p.eval('!!(window.__landingStage && window.__landingStage.stage)')) break; await sleep(50); }
    await sleep(4000);
    out.steps = [{ at: '1440x900', ...JSON.parse(await p.eval(STATE)) }];
    for (const [W, H, mobile] of [[834, 1194, true], [390, 844, true], [1024, 768, false], [768, 1024, true], [1440, 900, false]]) {
      await p.resize(W, H, { mobile, dpr: W < 640 ? 2 : 1 });
      await sleep(5000);
      const s = JSON.parse(await p.eval(STATE));
      out.steps.push({ at: `${W}x${H}`, ...s });
      writeFileSync(`landing/motion/switch-${W}.png`, await p.shot());
    }
    out.errors = p.errors;
  }
} finally { await b.close(); }
console.log(JSON.stringify(out, null, 1));

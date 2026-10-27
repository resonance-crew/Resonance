import { browser, proto, sleep, geom, writeFileSync, join, HERE } from './harness.mjs';
const b = await browser();
const out = join(HERE, 'raw', 'reduced'); (await import('node:fs')).mkdirSync(out, { recursive: true });
try {
  for (const [name, flags, opt] of [['d-light', '?view=desktop&theme=light&reduced=1', {}], ['d-dark', '?view=desktop&theme=dark&reduced=1', {}], ['m-light', '?view=mobile&theme=light&reduced=1', {}],
      ['m-dark-scroll', '?view=mobile&theme=dark&reduced=1&scroll=1700', {}], ['d-light-scroll', '?view=desktop&theme=light&reduced=1&scroll=2500', {}]]) {
    const p = await proto(b, flags, { dpr: 1 });
    await sleep(1500);
    const g = await geom(p);
    writeFileSync(join(out, name + '.png'), await p.shot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h } }));
    const a = await p.eval('JSON.stringify(__msp.stage.visitors())'); await sleep(1500); const c = await p.eval('JSON.stringify(__msp.stage.visitors())');
    const blinkOrRaf = await p.eval('__msp.stage.stats().n');
    console.log(name, a, 'same after 1.5s', a === c, 'raf frames', blinkOrRaf);
    // scroll the page: does the still character follow / vanish / get replaced?
    await p.eval('__msp.scrollToPage(1500)'); await sleep(500);
    console.log('   after scrolling away:', await p.eval('JSON.stringify(__msp.stage.visitors())'));
    await p.send('Page.close').catch(() => {});
  }
  // toggling reduced motion mid-visit and back
  const p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=3&at=badges&who=card', { dpr: 1 });
  await sleep(4000);
  await p.eval(`document.querySelector('[data-reduced]').click()`); await sleep(300);
  console.log('toggled on mid-visit:', await p.eval('JSON.stringify(__msp.stage.visitors())'), await p.eval('document.querySelector("[data-status]").innerText'));
  await p.eval(`document.querySelector('[data-reduced]').click()`); await sleep(3500);
  console.log('toggled off:', await p.eval('JSON.stringify(__msp.stage.visitors())'));
} finally { await b.close(); }

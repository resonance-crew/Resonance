import { browser, proto, sleep, geom, writeFileSync, join, HERE } from './harness.mjs';
const b = await browser(); const files = [];
try {
  const p = await proto(b, `?view=desktop&theme=light&reduced=0&seed=3`, { dpr: 2 });
  await p.eval('__msp.stage.pause()');
  for (const who of ['tuck', 'tag', 'card', 'dot', 'night']) {
    await p.eval(`__msp.visitAt('qr-point', '${who}', 'look+look+look')`); await p.eval('__msp.stage.pause()');
    await p.eval(`(() => { const st = __msp.stage; for (let i = 0; i < 12 * 9; i++) { st.advance(1/12); const v = st.visitors()[0]; if (v && v.mode === 'act') break; } st.advance(0.3); })()`);
    // click once (hop), wait, click again (shy)
    await p.eval(`document.querySelector('.ms-char img[src$="/torso.png"]').click()`); 
    for (const [dt, lab] of [[0.25, 'click1 +0.25'], [1.0, '+1.25'], [0, 'click2'], [0.35, 'shy +0.35'], [0.3, 'shy +0.65']]) {
      if (lab === 'click2') { await p.eval(`document.querySelector('.ms-char img[src$="/torso.png"]').click()`); continue; }
      await p.eval(`__msp.stage.advance(${dt})`); await sleep(40);
      const r = JSON.parse(await p.eval(`JSON.stringify((() => { const r = document.querySelector('.ms-char img[src$="/torso.png"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })())`));
      const s = Math.max(r.w, r.h);
      const f = join(HERE, 'raw', `_shy_${files.length}.png`); writeFileSync(f, await p.shot({ clip: { x: r.x - s * 1.1, y: r.y - s * 1.2, width: s * 2.2, height: s * 2.2 } }));
      files.push([f, who + ' ' + lab]);
    }
  }
} finally { await b.close(); }
writeFileSync(join(HERE, 'raw', '_shy.json'), JSON.stringify(files));

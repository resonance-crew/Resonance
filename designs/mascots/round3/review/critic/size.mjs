import { browser, proto, sleep, geom, writeFileSync, join, HERE } from './harness.mjs';
const b = await browser(); const files = [];
try {
  for (const [view, at, who, size] of [['desktop', 'qr-point', 'tuck', 100], ['desktop', 'badges', 'tag', 100], ['desktop', 'headline-r', 'card', 100], ['desktop', 'qr-point', 'tuck', 85], ['desktop', 'badges', 'tag', 85], ['desktop', 'headline-r', 'card', 85],
      ['mobile', 'headline-r', 'tuck', 100], ['mobile', 'headline-l', 'tag', 100], ['mobile', 'headline-r', 'tuck', 85], ['mobile', 'headline-l', 'tag', 85]]) {
    const p = await proto(b, `?view=${view}&theme=light&reduced=0&seed=3&size=${size}`, { dpr: 1 });
    await p.eval('__msp.stage.pause()');
    const ok = await p.eval(`__msp.visitAt('${at}', '${who}', 'look')`); await p.eval('__msp.stage.pause()');
    await p.eval(`(() => { const st = __msp.stage; for (let i = 0; i < 12 * 9; i++) { st.advance(1/12); const v = st.visitors()[0]; if (v && v.mode === 'act') { st.advance(0.5); break; } } })()`);
    await sleep(60);
    const g = await geom(p); const f = join(HERE, 'raw', `_size_${files.length}.png`);
    writeFileSync(f, await p.shot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h } }));
    files.push([f, `${view} ${who} @${at} size ${size}% ` + (await p.eval('JSON.stringify(__msp.stage.visitors().map(v => v.slug + " h=" + Math.round(v.h)))'))]);
    await p.send('Page.close').catch(() => {});
  }
} finally { await b.close(); }
writeFileSync(join(HERE, 'raw', '_size.json'), JSON.stringify(files));

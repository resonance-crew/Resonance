// node spots.mjs <name> <desktop|mobile>[-dark] "<ledge>:<slug>:<act+act>,…" [secs=12] [step=0.25] [fps=12|smooth]
// one page; per case: pause, visitAt, then step the stage and keep full-view frames + where the visitor is
import { browser, proto, geom, state, shotView, sleep, mkdirSync, writeFileSync, join, HERE } from './harness.mjs';
const [name, view = 'desktop', casesArg, secs = '12', step = '0.25', fps = '12'] = process.argv.slice(2);
const [v, theme = 'light'] = view.split('-');
const b = await browser();
try {
  const p = await proto(b, `?view=${v}&theme=${theme}&reduced=0&seed=3${fps === 'smooth' ? '&fps=smooth' : ''}`, { width: 1440, height: 1000, dpr: 2 });
  await p.eval('__msp.stage.pause()');
  for (const c of casesArg.split(',')) {
    const [at, who = '', acts = ''] = c.split(':');
    const key = `${at}-${who || 'any'}-${(acts || 'rnd').replace(/\+/g, '_')}`;
    const dir = join(HERE, 'raw', name, key); mkdirSync(dir, { recursive: true });
    await p.eval('__ev.length = 0');
    const ok = await p.eval(`__msp.visitAt(${JSON.stringify(at)}, ${JSON.stringify(who)}, ${JSON.stringify(acts)})`);
    await p.eval('__msp.stage.pause()');
    const meta = [];
    const n = Math.round(Number(secs) / Number(step));
    for (let i = 0; i <= n; i++) {
      if (i) await p.eval(`__msp.stage.advance(${step})`);
      await sleep(35);
      const g = await geom(p), s = await state(p);
      await shotView(p, g, join(dir, String(i).padStart(3, '0') + '.png'));
      meta.push({ i, g, ...s });
      if (i > 4 && !s.v.length) break;
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name: key, case: c, ok, dpr: 2, step: Number(step), frames: meta, events: await p.eval('__ev'), log: await p.eval('__log') }));
    console.log(key, 'ok', ok, 'frames', meta.length, (await p.eval('__ev')).map(e => e[0] + ' ' + e[1].replace(/<[^>]+>/g, '')).join(' | '));
  }
} finally { await b.close(); }

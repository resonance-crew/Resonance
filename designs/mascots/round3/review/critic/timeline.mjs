// node timeline.mjs <name> "<flags>" [secs=30] [step=0.25] [mode=step|real] [view w,h]
// stepped: pauses the stage and advances it by `step` between shots (exact stage time); real: shoots while it runs.
import { browser, proto, geom, state, shotView, sleep, mkdirSync, writeFileSync, join, HERE } from './harness.mjs';
const [name, flags, secs = '30', step = '0.25', mode = 'step', win = ''] = process.argv.slice(2);
const mobile = /view=mobile/.test(flags);
const [W, H] = win ? win.split(',').map(Number) : mobile ? [1440, 1000] : [1440, 1000];
const dir = join(HERE, 'raw', name); mkdirSync(dir, { recursive: true });
const b = await browser();
try {
  const p = await proto(b, flags, { width: W, height: H, dpr: 2 });
  if (/[?&](at|meet)=/.test(flags)) await sleep(700);   // the prototype's own timers
  if (mode === 'step') await p.eval('__msp.stage.pause()');
  const meta = [];
  const n = Math.round(Number(secs) / Number(step));
  const t0 = Date.now();
  for (let i = 0; i <= n; i++) {
    if (i) {
      if (mode === 'step') await p.eval(`__msp.stage.advance(${step})`);
      else await sleep(Math.max(0, i * Number(step) * 1000 - (Date.now() - t0)));
    }
    await sleep(mode === 'step' ? 40 : 0);
    const g = await geom(p), s = await state(p);
    const f = join(dir, String(i).padStart(3, '0') + '.png');
    await shotView(p, g, f);
    meta.push({ i, g, ...s });
  }
  const ev = await p.eval('window.__ev'), log = await p.eval('window.__log');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name, flags, dpr: 2, step: Number(step), mode, frames: meta, events: ev, log }, null, 0));
  console.log(name, 'frames', meta.length, 'log', JSON.stringify(log));
  for (const e of ev) console.log('  ', e[0], e[1].replace(/<[^>]+>/g, ''));
} finally { await b.close(); }

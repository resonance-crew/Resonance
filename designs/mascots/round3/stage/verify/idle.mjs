// verify/idle.mjs — how often the stage wakes in the stepped mode (animation frames and timers per second), and the
// reduced-motion character after loading mid-page (it should be somewhere in view)
import { launch } from '../../kit/cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), URL0 = 'file://' + join(HERE, '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch();
try {
  for (const fps of ['12', 'smooth']) {
    const p = await b.open(`${URL0}?view=desktop&reduced=0&seed=3&fps=${fps}`, { width: 1440, height: 1000 });
    await sleep(2500);
    console.log(fps, await p.eval(`new Promise(res => { let raf = 0, to = 0; const R = requestAnimationFrame, T = setTimeout;
      window.requestAnimationFrame = f => { raf++; return R(f); }; window.setTimeout = (f, ms) => { to++; return T(f, ms); };
      const t0 = __msp.stage.time; T(() => { window.requestAnimationFrame = R; window.setTimeout = T;
        res({ rafPerSec: +(raf / 3).toFixed(1), timersPerSec: +(to / 3).toFixed(1), stageSec: +(__msp.stage.time - t0).toFixed(2) }); }, 3000); })`));
  }
  const p = await b.open(`${URL0}?view=desktop&reduced=1&scroll=2500`, { width: 1440, height: 1000 });
  await sleep(1200);
  console.log('reduced, loaded at 2500:', await p.eval('JSON.stringify(__msp.stage.visitors().map(v => [v.slug, v.ledge, Math.round(v.y)]))'));
} finally { await b.close(); }

import { launch } from '../cdp4.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROTO = 'file:///private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/stage/index.html';
const OUT = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live';
const b = await launch(); const files = [];
try {
  const p = await b.open(`${PROTO}?view=desktop&theme=light&reduced=0&seed=3&scroll=1450`, { width: 1474, height: 1100 });
  await sleep(10);
  await p.eval('__msp.stage.pause()');
  // restart the visit under our control
  await sleep(600);
  const ok = await p.eval(`(() => { const st = __msp.stage; st.pause(); st.setReducedMotion(true); st.setReducedMotion(false); return st.visit({ ledge: 'card-4-top', slug: 'tag', acts: ['look'] }); })()`);
  for (let k = 0; k < 12; k++) {
    await p.eval(`__msp.stage.advance(${k ? 1 / 6 : 0.05})`);
    await sleep(80);
    const pc = JSON.parse(await p.eval(`(() => { const F = __msp.frame; const v = __msp.stage.visitors()[0]; const pr = F.page.getBoundingClientRect(); const l = F.V.ledges.find(x => x.id === 'card-4-top'); const y = l.points[0][1];
      return JSON.stringify({ s: F.s, x: pr.left + (v ? v.x : l.points[0][0]) * F.s + scrollX, y: pr.top + y * F.s + scrollY, mode: v && v.mode }); })()`));
    const f = `${OUT}/proto-climb-${String(k).padStart(2, '0')}-${pc.mode}.png`;
    writeFileSync(f, await p.shot({ clip: { x: pc.x - 150 * pc.s, y: pc.y - 230 * pc.s, width: 300 * pc.s, height: 290 * pc.s }, scale: 1 / pc.s }));
    files.push(f);
  }
  console.log('ok', ok);
} finally { await b.close(); }
execFileSync('python3', ['/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live-tools/sheet.py', OUT + '/proto-climb-card-4-top-tag.png', '12', '160', ...files]);
process.exit(0);

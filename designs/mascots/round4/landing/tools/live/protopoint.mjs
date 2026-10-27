import { launch } from '../cdp4.mjs';
import { writeFileSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROTO = 'file:///private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/stage/index.html';
const OUT = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live';
const b = await launch();
try {
  for (const [view, id, who] of [['desktop', 'badges', 'tuck'], ['mobile', 'badge-l', 'card']]) {
    const p = await b.open(`${PROTO}?view=${view}&theme=light&reduced=0&seed=3&at=${id}&who=${who}&do=point+point`, { width: view === 'desktop' ? 1474 : 600, height: 1100 });
    for (const t of [3000, 2000, 2000]) {
      await sleep(t);
      const pc = JSON.parse(await p.eval(`(() => { const F = __msp.frame; const v = __msp.stage.visitors()[0]; const pr = F.page.getBoundingClientRect();
        return JSON.stringify({ s: F.s, x: pr.left + v.x * F.s + scrollX, y: pr.top + v.y * F.s + scrollY }); })()`));
      const clip = { x: Math.max(0, pc.x - 260 * pc.s), y: Math.max(0, pc.y - 170 * pc.s), width: 400 * pc.s, height: 200 * pc.s };
      writeFileSync(`${OUT}/proto-${view}-${id}-point-${t}-${Math.random().toString(36).slice(2, 5)}.png`, await p.shot({ clip, scale: 1 / pc.s }));
    }
  }
} finally { await b.close(); }
process.exit(0);

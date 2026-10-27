// hover / click / second click (desktop, real time), clicking mid-meeting, and a touch tap on a phone
import { browser, proto, sleep, writeFileSync, join, HERE } from './harness.mjs';
const OUT = join(HERE, '../checks');
const b = await browser();
const shots = [];
async function charBox(p, i = 0) {
  return JSON.parse(await p.eval(`JSON.stringify((() => { const el = document.querySelectorAll('.ms-char')[${i}]; if (!el) return null; const r = el.querySelector('img[src$="/torso.png"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })())`));
}
const status = p => p.eval('document.querySelector("[data-status]").innerText.split("\\n")[0]');
async function shot(p, c, label, scale = 1) {
  const png = await p.shot({ clip: { x: c.x - c.w * 1.5, y: c.y - c.h * 1.7, width: c.w * 3, height: c.h * 2.8 }, scale });
  const f = join(HERE, 'raw', `_poke_${shots.length}.png`); writeFileSync(f, png); shots.push([f, label + ' · ' + (await status(p)).replace(/<[^>]+>/g, '')]);
}
try {
  // 1. desktop: Tuck at the badges; hover, click, click
  let p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=3&at=badges&who=tuck', { dpr: 2 });
  for (let i = 0; i < 80; i++) { if (/指給你看|揮手|東張西望/.test(await status(p))) break; await sleep(100); }
  await sleep(2600);
  const mouse = (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  let c = await charBox(p); await shot(p, c, 'before hover');
  await mouse('mouseMoved', c.x + c.w * 2, c.y - c.h * 1.2, { button: 'none' }); await sleep(80);
  await mouse('mouseMoved', c.x + c.w * 0.2, c.y - c.h * 0.1, { button: 'none' }); await sleep(350); await shot(p, c, 'hover 0.35s');
  await sleep(500); await shot(p, c, 'hover 0.85s');
  await mouse('mouseMoved', c.x - c.w * 0.3, c.y + c.h * 0.2, { button: 'none' }); await sleep(300); await shot(p, c, 'hover moved low-left');
  c = await charBox(p); await mouse('mousePressed', c.x, c.y, { clickCount: 1 }); await mouse('mouseReleased', c.x, c.y, { clickCount: 1 });
  await sleep(180); await shot(p, c, 'click 1 +0.18s'); await sleep(250); await shot(p, c, 'click 1 +0.43s');
  await sleep(1200);
  c = await charBox(p); await mouse('mousePressed', c.x, c.y, { clickCount: 1 }); await mouse('mouseReleased', c.x, c.y, { clickCount: 1 });
  await sleep(300); await shot(p, c, 'click 2 +0.3s'); await sleep(500); await shot(p, c, 'click 2 +0.8s'); await sleep(900); await shot(p, c, 'click 2 +1.7s');
  console.log('cursor over torso:', await p.eval(`getComputedStyle(document.querySelector('.ms-char img.ms-hit')).cursor`));
  // 2. clicking one of a meeting pair
  p = await proto(b, '?view=desktop&theme=light&reduced=0&seed=4&meet=1&variant=five', { dpr: 2 });
  for (let i = 0; i < 120; i++) { if (/共振/.test(await status(p))) break; await sleep(100); }
  c = await charBox(p, 0); const c2 = await charBox(p, 1);
  const both = { x: (c.x + c2.x) / 2, y: c.y, w: Math.abs(c.x - c2.x) / 2 + c.w, h: c.h };
  await shot(p, both, 'meeting');
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(300);
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(400); await shot(p, both, 'clicked twice mid-meeting +0.4s'); await sleep(900); await shot(p, both, '+1.3s'); await sleep(1200); await shot(p, both, '+2.5s');
  // 3. phone: tap
  p = await proto(b, '?view=mobile&theme=light&reduced=0&seed=5&at=headline-r&who=tuck', { width: 390, height: 844, dpr: 3, mobile: true });
  for (let i = 0; i < 80; i++) { if (/揮手|東張西望|伸懶腰|整理/.test(await status(p))) break; await sleep(100); }
  await sleep(500);
  c = await charBox(p); await shot(p, c, 'phone before tap', 0.7);
  const tap = async (x, y) => { await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await tap(c.x, c.y); await sleep(250); await shot(p, c, 'tap 1 +0.25s', 0.7);
  await sleep(1300); c = await charBox(p); await tap(c.x, c.y); await sleep(400); await shot(p, c, 'tap 2 +0.4s', 0.7);
  console.log('tap target size (css px):', JSON.stringify(c));
} finally { await b.close(); }
writeFileSync(join(HERE, 'raw', '_poke.json'), JSON.stringify(shots));

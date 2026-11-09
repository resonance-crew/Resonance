// One Day's demo: a slow scroll through the day, pausing on each scene — the hero's entrances, the stories (on a
// phone, two pulls of the 紙芝居), the three beats of the answer (the third long enough for the meeting, the note and
// 摺摺's corner), the dusk, the night band's curtain call, the footer.
import { writeFileSync } from 'node:fs';

export default async (page, { size, vp }) => {
  const phone = vp.width < 500;
  // when the demo starts, in the page's own clock (≈ the recording's): the lead-in before it is trimmed off afterwards
  const startedAt = await page.evaluate(() => performance.now());
  writeFileSync(new URL(`./media/start-${size}.txt`, import.meta.url), String(startedAt / 1000));
  const wait = (ms) => page.waitForTimeout(ms);
  const y = () => page.evaluate(() => window.scrollY);
  // a reader's scroll: a steady pace, a step every frame (scrollTo, so the pace is exact)
  const scrollTo = async (target, pxPerSec = phone ? 560 : 680) => {
    const from = await y();
    const dist = target - from;
    const frames = Math.max(1, Math.round((Math.abs(dist) / pxPerSec) * 30));
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await page.evaluate((v) => window.scrollTo(0, v), from + dist * e);
      await wait(33);
    }
  };
  const at = (sel, fn) => page.evaluate(([sel, fn]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    // eslint-disable-next-line no-new-func
    return new Function('top', 'r', 'vh', 'vw', `return ${fn}`)(top, r, window.innerHeight, window.innerWidth);
  }, [sel, fn]);

  // morning: 摺摺 walks in from the wings, 點點 pops up
  await page.mouse.move(vp.width * 0.7, vp.height * 0.45);
  await wait(6500);
  if (!phone) {
    // the two cards follow a fine pointer a few px
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(vp.width * (0.55 + 0.35 * Math.sin(i / 3)), vp.height * (0.4 + 0.15 * Math.cos(i / 4)));
      await wait(70);
    }
  }

  // noon: the stories
  await scrollTo(await at('[data-scene="stories"] ol', phone ? 'top - vh * 0.3' : 'top - vh * 0.3'));
  await wait(4500);
  if (phone) {
    const next = page.getByRole('button', { name: /^(下一張|Next)/ }).first();
    for (let i = 0; i < 2; i++) {
      await next.tap().catch(() => next.click());
      await wait(1600);
    }
    await wait(1200);
  } else {
    await scrollTo(await at('[data-scene="stories"] ol', 'top + r.height - vh * 0.75'));
    await wait(2500);
  }

  // late afternoon: the answer, beat by beat
  const beat = (n) => at(`li[data-n="${n}"]`, phone ? 'top - vh * 0.57' : 'top + r.height / 2 - vh * 0.5');
  await scrollTo(await beat(1));
  await wait(5500);
  await scrollTo(await beat(2), 380);
  await wait(6500);
  await scrollTo(await beat(3), 380);
  await wait(22000);

  // dusk: your turn — 牽牽 points at the write button; hovering it, the blank sixth looks up
  await scrollTo(await at('[data-scene="dusk"]', 'top - vh * 0.05'));
  await wait(4500);
  if (!phone) {
    const write = page.locator('[data-write]').first();
    await write.hover().catch(() => {});
    await wait(2200);
    await page.mouse.move(vp.width * 0.5, vp.height * 0.2);
    await wait(800);
  }

  // night: the stars come out as it scrolls in, the curtain call, 悄悄 under its hole
  await scrollTo(await at('[data-call]', 'top - vh * 0.5'), 420);
  await wait(7000);
  await scrollTo(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight));
  await wait(2500);
};

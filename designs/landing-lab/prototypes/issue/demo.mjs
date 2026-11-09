// The issue's signature moments, driven for the demo video (shoot.mjs --video --demo):
// the idle ripple, a click on the title, 摺摺 tapped in its cell (a hop that rings the title, then its corner lifted),
// a slow read down the contents (two rows pointed at on a desktop: the sidenote and 點點 follow), the spread held until
// 牽牽 has handed 點點 the note and the answer's title has rung, page B pulled away and let go (desktop), then the rest.
export default async (page, { size }) => {
  const desktop = size === 'desktop';
  const wait = (ms) => page.waitForTimeout(ms);
  // a hand's scroll, eased, run in the page (one round trip): its duration is the page's own clock
  const glide = (to, ms) =>
    page.evaluate(
      ([y1, dur]) =>
        new Promise((done) => {
          const y0 = window.scrollY;
          const t0 = performance.now();
          const step = (now) => {
            const u = Math.min(1, (now - t0) / dur);
            const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
            window.scrollTo(0, Math.round(y0 + (y1 - y0) * e));
            if (u < 1) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        }),
      [to, ms],
    );
  const top = (sel, off = 0) =>
    page.evaluate(([s, o]) => {
      const el = document.querySelector(s);
      return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - o) : 0;
    }, [sel, off]);
  const press = async (x, y) => {
    if (desktop) await page.mouse.click(x, y);
    else await page.touchscreen.tap(x, y);
  };

  // 1 · the cover: the idle ripple has run (or runs now); the title clicked; 摺摺 tapped twice
  await wait(1500);
  const glyph = await page.locator('#issue-title [data-ripple]').first().boundingBox();
  if (glyph) await press(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2);
  await wait(2200);
  // the puppet in the fourth cell (not 點點 on the phone's ≋ row, whose stage may have started first)
  const cell = await page.locator('[class*="cellLayer"] .ms-char .ms-hit, [class*="enCell"] .ms-char .ms-hit').first().boundingBox().catch(() => null);
  if (cell) {
    await press(cell.x + cell.width / 2, cell.y + cell.height / 2);
    await wait(2200);
    await press(cell.x + cell.width / 2, cell.y + cell.height / 2);
    await wait(3200);
  }

  // 2 · the contents, read slowly; on a desktop two rows pointed at (the sidenote and 點點 turn to each)
  const contents = await top('#stories', desktop ? 90 : 60);
  await glide(contents, 2200);
  await wait(1500);
  if (desktop) {
    const rows = page.locator('#stories ol > li a');
    for (const i of [1, 3]) {
      const b = await rows.nth(i).boundingBox();
      if (b) {
        await page.mouse.move(b.x + 200, b.y + b.height / 2, { steps: 12 });
        await wait(2800);
      }
    }
    await page.mouse.move(1380, 860, { steps: 8 });
  }
  const end = await top('#stories ol', 0);
  const listH = await page.evaluate(() => document.querySelector('#stories ol')?.getBoundingClientRect().height ?? 600);
  await glide(end + listH - (desktop ? 500 : 520), 4200);
  await wait(800);

  // 3 · the spread: held until the note is handed over and the answer's title rings
  if (desktop) {
    const spread = await top('[aria-labelledby="spread-title"]', 40);
    await glide(spread + 160, 2600);
    await wait(19500);
  } else {
    // the stacked pages: page A read on the way down, then the meeting strip between the two pages held in view
    const strip = await top('[aria-labelledby="spread-title"] [class*="footStage"]', 420);
    await glide(strip, 3200);
    await wait(18500);
  }

  // 4 · page B pulled away from page A and let go (a mouse only)
  if (desktop) {
    const b = await page.locator('article[data-side="b"] p[class*="opening"]').boundingBox();
    if (b) {
      for (let k = 0; k < 2; k++) {
        await page.mouse.move(b.x + 40, b.y + 30, { steps: 6 });
        await page.mouse.down();
        await page.mouse.move(b.x + 160, b.y + 34, { steps: 24 });
        await wait(700);
        await page.mouse.up();
        await wait(1400);
      }
    }
  }

  // 5 · the last page, the staff, the night
  const last = await top('[aria-labelledby="last-title"]', 60);
  await glide(last, 2600);
  await wait(5500);
  const h = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await glide(h, 3600);
  await wait(2500);
};

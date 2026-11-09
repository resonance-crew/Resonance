// Prototype A's signature: answer a real story on the desk, watch the line become a linked card while 聆聆 hands
// 牽牽 the folded note and 牽牽 carries it over the thread (on a phone: up the margin thread, tucked on the story's
// foot); then the stories (點點), the night (摺摺's corner), and 悄悄 by its line in the footer.
export default async (page, { size }) => {
  const phone = size === 'phone';
  const wheel = async (dy, steps = 1, wait = 30) => {
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(wait);
    }
  };
  // a moment on the desk as it is: the stills come alive
  await page.waitForTimeout(2500);
  // a little scroll (on a phone, the whole blank card comes up, the story's foot still in view)
  if (phone) await wheel(12, 30, 24);
  else await wheel(6, 10, 24);
  await page.waitForTimeout(1400);
  // the first starter, then 回應
  const chip = page.locator('button[aria-label^="插入"], button[aria-label^="Insert"]').first();
  if (phone) await chip.tap();
  else {
    await chip.hover();
    await page.waitForTimeout(400);
    await chip.click();
  }
  await page.waitForTimeout(1100);
  const send = page.locator('form button').last();
  if (phone) await send.tap();
  else {
    await send.hover();
    await page.waitForTimeout(300);
    await send.click();
  }
  // the card is inked, the thread drawn with its three waves, the captions; 聆聆 hands 牽牽 the note and it carries it
  // over (about four seconds), then says hello there and 聆聆 pops back onto its seat
  await page.waitForSelector('[data-landed]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(phone ? 4200 : 4600);
  // then slowly to the end, pausing where something happens: the shelf and 點點, the night's wave (摺摺 and the
  // corner), the footer (悄悄 by 「晚安，再讀一個就好」)
  const stops = await page.evaluate(() => {
    const y = (sel, off) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY - off) : null;
    };
    return [y('#shelf-title', 140), y('#night-title', window.innerHeight * 0.62), y('footer [href$="/home"]', window.innerHeight * 0.55)].filter((v) => v != null);
  });
  const h = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  let y = await page.evaluate(() => window.scrollY);
  const step = 6;
  while (y < h) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(20);
    y += step;
    if (stops.some((s) => Math.abs(y - s) < step / 2 + 0.5)) await page.waitForTimeout(2800);
  }
  await page.waitForTimeout(4000);
};

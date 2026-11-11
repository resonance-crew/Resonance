// Capture a page with Playwright's Chromium.
//   node shoot.mjs <url> <outPrefix> [--sizes desktop,phone] [--scheme light|dark] [--wait ms]
//                  [--video] [--speed px_per_s] [--demo /abs/demo.mjs]
// Writes <out>-<size>-fold.png and <out>-<size>-full.png; with --video also <out>-<size>.mp4, a steady scroll
// through the page (or, with --demo, whatever the demo module's default export does: async (page, { size, vp }) => {}).
import { chromium } from '/Users/ncchen/Documents/Resonance/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [url, out, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const video = rest.includes('--video');
const scheme = opt('--scheme', 'light');
const wait = Number(opt('--wait', '6000'));
const speed = Number(opt('--speed', '420'));
const demoPath = opt('--demo', null);
const sizes = opt('--sizes', 'desktop,phone').split(',');
const SIZES = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };
const demo = demoPath ? (await import(demoPath)).default : null;
const browser = await chromium.launch();
for (const s of sizes) {
  const vp = SIZES[s];
  const vdir = `${out}-${s}-rec`;
  if (video) { rmSync(vdir, { recursive: true, force: true }); mkdirSync(vdir, { recursive: true }); }
  const phone = s === 'phone';
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: phone ? 2 : 1, colorScheme: scheme, isMobile: phone, hasTouch: phone,
    ...(video ? { recordVideo: { dir: vdir, size: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 } } } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(wait);
  if (!video) await page.screenshot({ path: `${out}-${s}-fold.png` });
  if (video) {
    if (demo) await demo(page, { size: s, vp });
    else {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const step = 8, dt = Math.round((step / speed) * 1000);
      for (let y = 0; y < h; y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(dt); }
      await page.waitForTimeout(2500);
    }
  }
  if (!video) await page.screenshot({ path: `${out}-${s}-full.png`, fullPage: true });
  const v = page.video();
  await ctx.close();
  if (v) {
    const src = await v.path();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'medium', '-movflags', '+faststart', '-an', `${out}-${s}.mp4`]);
    rmSync(vdir, { recursive: true, force: true });
  }
}
await browser.close();
console.log('ok', out);

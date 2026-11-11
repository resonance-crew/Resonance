#!/usr/bin/env node
/**
 * Demo videos of the landing film (SPEC §12): Playwright Chromium records the lab page while it plays, then ffmpeg
 * makes an H.264 mp4 of it.
 *
 *   node designs/landing-lab/film/tools/video.mjs <url> <outDir> [--sizes desktop,phone] [--mode play|scroll] [--seed 7]
 *     [--hidpi] [--hold <seconds>] [--fine]
 *
 * Contexts: desktop 1440×900 at DPR 1; phone 390×844 and tablet 820×1180 at DPR 2 with isMobile and hasTouch (scroll
 * mode drives the tablet as the phone, with touch); the video at the viewport's
 * size (--hidpi: at the context's device pixels, so the phone's video is 780×1688 and sharp on a Retina screen — the
 * headless screencast only gives device pixels when the browser itself runs at that scale, hence
 * `--force-device-scale-factor`). Each waits for `window.__film.ready`.
 * - play: (--hold: after the first screen has been on for that long) clicks ▶ and waits until the film is over and
 *   the page is the visitor's again (at most 110 s: the film is 67 s since round 3, with its pauses), plus 2 s.
 * - scroll: lets the prologue play (7 s), then scrolls segment by segment (`__film.segments()`): travel and change
 *   segments at about 1.1× their film time — desktop with mouse-wheel steps of 40–90 px every 16–24 ms (seeded),
 *   (--fine: steps of 6–12 px, so the end section — plain page scrolling, which no clock smooths — doesn't judder),
 *   the phone with CDP touch gestures in flicks of 300–400 px, waiting for 120 ms of quiet; at each act it waits until
 *   `state().acting` is false, plus 0.8 s; then it scrolls the end section at 600 px/s to the footer and holds 2 s.
 * Output: film-{size}-{mode}.mp4 in outDir (`ffmpeg -c:v libx264 -pix_fmt yuv420p -crf 23 -preset medium
 * -movflags +faststart -an`).
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '/Users/ncchen/Documents/Resonance-landing/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:3200/zh-TW/lab/landing/film';
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : '/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/build/media';
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const sizes = opt('sizes', 'desktop,phone').split(',');
const mode = opt('mode', 'play');
const hidpi = args.includes('--hidpi');
const hold = Number(opt('hold', '0'));
const fine = args.includes('--fine');
let seed = Number(opt('seed', '7'));
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
mkdirSync(outDir, { recursive: true });

const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The dev server's Next.js indicator (the "N" badge in `nextjs-portal`) sits on the lip's ▶: never in the demo. */
const hideDevOverlay = () => {
  const add = () => {
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal{display:none!important}';
    document.documentElement.append(s);
  };
  if (document.documentElement) add();
  else document.addEventListener('DOMContentLoaded', add);
};

async function playThrough(page) {
  // the visible ▶ (the intro's)
  const btn = page.locator('[data-lip] [data-play]').filter({ visible: true }).first();
  if (hold > 0) await sleep(hold * 1000);
  await btn.click();
  const t0 = Date.now();
  const end = await page.evaluate(() => window.__film.segments().at(-1).t1);
  await sleep(1500);
  while (Date.now() - t0 < 110_000) {
    const st = await page.evaluate(() => window.__film.state());
    if (st.mode === 'browse' && st.s >= end - 0.01) break;
    await sleep(250);
  }
  await sleep(2000);
}

async function scrollThrough(page, size) {
  await sleep(7000);
  const segs = await page.evaluate(() => window.__film.segments());
  const svh = await page.evaluate(() => window.innerHeight / 100);
  const filmTop = await page.evaluate(() => document.querySelector('[data-film-root]').getBoundingClientRect().top + window.scrollY);
  const cdp = SIZES[size].hasTouch ? await page.context().newCDPSession(page) : null;
  const scrollTo = async (targetY, seconds) => {
    const start = await page.evaluate(() => window.scrollY);
    const dist = targetY - start;
    if (dist <= 1) return;
    const t0 = Date.now();
    if (cdp) {
      let done = 0;
      while (done < dist - 2) {
        const flick = Math.min(dist - done, 300 + rand() * 100);
        await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -flick, speed: 900, gestureSourceType: 'touch', preventFling: true });
        done = (await page.evaluate(() => window.scrollY)) - start;
        await sleep(120);
        const want = (done / dist) * seconds * 1000 - (Date.now() - t0);
        if (want > 0) await sleep(want);
      }
    } else {
      await page.mouse.move(720, 450);
      let done = 0;
      while (done < dist - 1) {
        const step = Math.min(dist - done, fine ? 6 + rand() * 6 : 40 + rand() * 50);
        await page.mouse.wheel(0, step);
        done += step;
        const want = (done / dist) * seconds * 1000 - (Date.now() - t0);
        await sleep(Math.max(16 + rand() * 8, want));
      }
    }
  };
  for (const s of segs) {
    if (s.kind === 'hold') continue;
    const y1 = filmTop + s.y1 * svh;
    if (s.kind === 'act') {
      await scrollTo(y1, (s.t1 - s.t0) * 0.6);
      const t0 = Date.now();
      while (Date.now() - t0 < 12_000) {
        const st = await page.evaluate(() => window.__film.state());
        if (!st.acting) break;
        await sleep(150);
      }
      await sleep(800);
    } else await scrollTo(y1, (s.t1 - s.t0) * 1.1);
  }
  const foot = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const from = await page.evaluate(() => window.scrollY);
  await scrollTo(foot, (foot - from) / 600);
  await sleep(2000);
}

const maxDpr = Math.max(...sizes.map((z) => SIZES[z]?.deviceScaleFactor ?? 1));
const browser = await chromium.launch(hidpi && maxDpr > 1 ? { args: [`--force-device-scale-factor=${maxDpr}`] } : {});
try {
  for (const size of sizes) {
    const tmp = join(outDir, `.rec-${size}-${mode}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const { viewport, deviceScaleFactor: dpr = 1 } = SIZES[size];
    const videoSize = hidpi ? { width: viewport.width * dpr, height: viewport.height * dpr } : viewport;
    const ctx = await browser.newContext({ ...SIZES[size], recordVideo: { dir: tmp, size: videoSize } });
    await ctx.addInitScript(hideDevOverlay);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    if (mode === 'scroll') await scrollThrough(page, size);
    else await playThrough(page);
    await ctx.close();
    const webm = readdirSync(tmp).find((f) => f.endsWith('.webm'));
    const out = join(outDir, `film-${size}-${mode}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium', '-movflags', '+faststart', '-an', out]);
    renameSync(join(tmp, webm), join(outDir, `film-${size}-${mode}.webm`));
    rmSync(tmp, { recursive: true, force: true });
    console.log(out);
  }
} finally {
  await browser.close();
}

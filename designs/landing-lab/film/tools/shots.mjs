#!/usr/bin/env node
/**
 * Stills of the landing film (SPEC §12): Playwright Chromium against the lab dev server. For each size × locale ×
 * scheme it loads the page once, waits for `window.__film.ready`, then seeks (`__film.seek(t)`) to each time and
 * takes the viewport; `end` scrolls to the stories, `footer` to the page's foot. Console errors are collected and
 * written beside the shots (errors.json); a non-empty list is printed at the end.
 *
 *   node designs/landing-lab/film/tools/shots.mjs --out <dir> [--base http://localhost:3200] [--sizes phone,desktop]
 *     [--locales zh-TW,en] [--schemes light,dark] [--times 0,10,14,17,25,40.5,48,56,67.3,end,footer] [--reduced]
 *     [--rest] [--play <seconds>] [--query b=kin] [--prefix v1] [--savedata] [--nojs] [--full]
 *
 * --rest: the film rests (acts pure scrub: a still is the floor of its moment) — the lab's `?rest=1`, added to the
 * page's query (a visitor can no longer make it rest). --play n: after load, let the opening
 * act play n seconds before the first shot (no seek). Sizes: phone 390×844 (DPR 3, touch), tablet 820×1180,
 * tabletL 1180×820, desktop 1440×900, laptop 1366×768, landscape 844×390 (touch), narrow 320×640.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '/Users/ncchen/Documents/Resonance-landing/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const flag = (k) => args.includes(`--${k}`);

const base = opt('base', 'http://localhost:3200');
const out = opt('out', '/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/build/shots');
const prefix = opt('prefix', 'film');
const sizes = opt('sizes', 'phone,desktop').split(',');
const locales = opt('locales', 'zh-TW').split(',');
const schemes = opt('schemes', 'light').split(',');
// round 3's film (67.3 s): the opening, the wind, c1, the journey, the reading, c2, the meeting, c3, the night
const times = opt('times', '0,10,14,17,25,40.5,48,56,67.3,end').split(',');
// --rest is the lab flag `?rest=1` (runtime/index.ts), beside any --query of the caller's
const query = [opt('query', ''), flag('rest') ? 'rest=1' : ''].filter(Boolean).join('&');
const playFor = Number(opt('play', '0'));
mkdirSync(out, { recursive: true });

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tabletL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  desktopHi: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  narrow: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // iPhone SE (2nd/3rd gen) in Safari with its toolbars showing, and the first SE
  se: { viewport: { width: 375, height: 553 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  seFull: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  se1: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // a 6.1" iPhone in Safari with its toolbars showing
  phoneBars: { viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  for (const size of sizes) {
    for (const locale of locales) {
      for (const scheme of schemes) {
        const ctx = await browser.newContext({
          ...SIZES[size],
          colorScheme: scheme,
          reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
          javaScriptEnabled: !flag('nojs'),
        });
        // the dev server's Next.js indicator (the "N" badge in `nextjs-portal`) sits on the lip's ▶: never in a still
        await ctx.addInitScript(() => {
          const add = () => {
            const s = document.createElement('style');
            s.textContent = 'nextjs-portal{display:none!important}';
            document.documentElement.append(s);
          };
          if (document.documentElement) add();
          else document.addEventListener('DOMContentLoaded', add);
        });
        if (flag('savedata')) await ctx.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
        const page = await ctx.newPage();
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push({ size, locale, scheme, text: m.text().slice(0, 400) });
        });
        page.on('pageerror', (e) => errors.push({ size, locale, scheme, text: `pageerror: ${e.message}` }));
        const url = `${base}/${locale}/lab/landing/film${query ? `?${query}` : ''}`;
        await page.goto(url, { waitUntil: 'load', timeout: 120000 });
        if (!flag('nojs')) {
          await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 30000 }).catch(() => errors.push({ size, locale, scheme, text: 'never ready' }));
          await page.evaluate(() => document.fonts.ready);
        }
        await page.waitForTimeout(playFor ? playFor * 1000 : 900);
        const tag = `${prefix}-${size}-${locale}-${scheme}${flag('reduced') ? '-rm' : ''}${flag('savedata') ? '-sd' : ''}${flag('nojs') ? '-nojs' : ''}`;
        for (const t of times) {
          if (t === 'end' || t === 'footer') {
            await page.evaluate((w) => {
              const el = w === 'end' ? document.getElementById('stories') : document.querySelector('footer');
              el?.scrollIntoView({ behavior: 'instant', block: 'start' });
            }, t);
            await page.waitForTimeout(900);
          } else if (!flag('nojs') && !playFor) {
            await page.evaluate((s) => window.__film.seek(s), Number(t));
            await page.waitForTimeout(650);
          }
          const file = join(out, `${tag}-t${t}.png`);
          await page.screenshot({ path: file, fullPage: flag('full') });
          shots.push(file);
          if (playFor) break;
        }
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (scrollW > 0) errors.push({ size, locale, scheme, text: `horizontal overflow ${scrollW}px` });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, `${prefix}-errors.json`), JSON.stringify(errors, null, 2));
console.log(shots.join('\n'));
if (errors.length) console.log(`\n${errors.length} problem(s):\n` + errors.map((e) => `[${e.size} ${e.locale} ${e.scheme}] ${e.text}`).join('\n'));

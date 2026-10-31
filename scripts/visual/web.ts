/**
 * The web's captures: Playwright's own Chromium (pinned by the playwright
 * version, so a browser update never moves a pixel) at three fixed sizes, each
 * with its device scale, colour scheme and locale set, reduced motion on, CSS
 * animations finished, the caret hidden and the landing page's paper puppets
 * kept from loading. Each account signs in once per device and variant
 * (`window.__emulatorSignIn`, which emulator builds expose).
 */
import { writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { screensFor, shotName, type Account, type Screen, type Variant } from './screens';
import { SEED_PASSWORD, ignorePath, settle, shotPath, variantsFor, type Capture, type CaptureContext, type Rect } from './util';

export type WebDevice = { id: string; phone: boolean; width: number; height: number; touch: boolean };

export const WEB_DEVICES: WebDevice[] = [
  { id: 'phone', phone: true, width: 390, height: 844, touch: true },
  { id: 'tablet', phone: false, width: 820, height: 1180, touch: true },
  { id: 'desktop', phone: false, width: 1440, height: 900, touch: false },
];

/** Next's dev-mode badge, and anything else a dev build draws that production doesn't. */
const HIDE_DEV_CHROME = 'nextjs-portal{display:none!important}';

async function newContext(browser: Browser, device: WebDevice, v: Variant): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 2,
    isMobile: device.touch,
    hasTouch: device.touch,
    colorScheme: v.theme,
    reducedMotion: 'reduce',
    locale: v.locale,
    timezoneId: 'Asia/Taipei',
  });
  // The landing stage brings a puppet only once its pictures load: none ever do here.
  await context.route('**/mascots/**', (route) => route.abort());
  await context.addInitScript((css) => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, HIDE_DEV_CHROME);
  return context;
}

async function signIn(page: Page, ctx: CaptureContext, v: Variant, account: Account) {
  await page.goto(`${ctx.devUrl}/${v.locale}/signin`, { waitUntil: 'load' });
  await page.waitForFunction(() => '__emulatorSignIn' in window, null, { timeout: 60_000 });
  await page.evaluate(
    ([email, password]) => (window as unknown as { __emulatorSignIn: (e: string, p: string) => Promise<unknown> }).__emulatorSignIn(email, password),
    [`${account}@resonance.test`, SEED_PASSWORD] as const,
  );
  // The session cookie is minted in the background; cookie-authenticated reads wait on it.
  for (let i = 0; i < 40; i++) {
    if ((await page.context().cookies()).some((c) => c.name === '__session')) return;
    await page.waitForTimeout(250);
  }
  ctx.log(`  ${account}: no session cookie after 10 s, going on`);
}

/**
 * Requests the page is still waiting on, less the ones that never end: the
 * realtime SDK's long-poll channels (the header's badges, an open thread).
 * A blank page waiting for a compile or a read holds still too, so a stable
 * screenshot alone isn't enough: wait for these to drain first.
 */
function trackRequests(page: Page) {
  const open = new Set<unknown>();
  const endless = (url: string) => /\/(Listen|Write)\/channel/.test(url);
  page.on('request', (r) => !endless(r.url()) && open.add(r));
  page.on('requestfinished', (r) => open.delete(r));
  page.on('requestfailed', (r) => open.delete(r));
  return async (quietMs = 800, timeoutMs = 60_000) => {
    const end = Date.now() + timeoutMs;
    let quietSince = Date.now();
    while (Date.now() < end) {
      if (open.size) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
      await page.waitForTimeout(100);
    }
  };
}

const idle = new WeakMap<Page, ReturnType<typeof trackRequests>>();

async function shoot(page: Page, ctx: CaptureContext, screen: Screen, v: Variant): Promise<{ png: Buffer; settled: boolean; ignore: Rect[] }> {
  if (!idle.has(page)) idle.set(page, trackRequests(page));
  const route = screen.web?.route ?? screen.route;
  await page.goto(`${ctx.devUrl}/${v.locale}${route === '/' ? '' : route}`, { waitUntil: 'load', timeout: 120_000 });
  const ready = async () => {
    await idle.get(page)!();
    await page.evaluate(() => document.fonts.ready);
    // A shape not yet measured shows its CSS stand-in: wait for the drawn one.
    await page.waitForFunction(() => !document.querySelector('[data-shape-pending]'), null, { timeout: 15_000 }).catch(() => {});
  };
  await ready();
  if (screen.web?.click) {
    // The first one on screen: a phone and a desktop header may both be in the page, CSS showing one.
    await page.locator(screen.web.click).locator('visible=true').first().click();
    await ready();
  }
  const mask = (screen.mask ?? []).map((s) => page.locator(s));
  const shot = await settle(
    () => page.screenshot({ fullPage: screen.fullPage, animations: 'disabled', caret: 'hide', mask, scale: 'device' }),
    { timeoutMs: 30_000, intervalMs: 600 },
  );
  return { ...shot, ignore: await ignored(page, !!screen.fullPage) };
}

/**
 * Where the comparison looks away, in capture pixels: the story cards' cover titles (StoryCard's
 * placeholder, SVG text in a monospace font scaled to fit the cover), whose glyphs come out spaced
 * a pixel or more differently from run to run. They stay in the picture for a person to see.
 */
const IGNORED = 'svg text[font-family="monospace"]';

function ignored(page: Page, fullPage: boolean): Promise<Rect[]> {
  return page.evaluate(
    ({ selector, fullPage }) => {
      const scale = window.devicePixelRatio;
      return [...document.querySelectorAll(selector)].flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return [];
        const x = (r.x + (fullPage ? window.scrollX : 0)) * scale;
        const y = (r.y + (fullPage ? window.scrollY : 0)) * scale;
        return [{ x: Math.floor(x), y: Math.floor(y), width: Math.ceil(r.width * scale), height: Math.ceil(r.height * scale) }];
      });
    },
    { selector: IGNORED, fullPage },
  );
}

export const captureWeb: Capture = async (ctx) => {
  const browser = await chromium.launch();
  const unsettled: string[] = [];
  try {
    const screens = screensFor('web', ctx.only);
    for (const device of WEB_DEVICES.filter((d) => !ctx.devices.length || ctx.devices.includes(d.id))) {
      for (const v of variantsFor(device.phone)) {
        // One context per account: a signed-out screen never sees someone's session.
        const accounts = [...new Set(screens.map((s) => s.as))];
        for (const account of accounts) {
          const context = await newContext(browser, device, v);
          const page = await context.newPage();
          try {
            if (account) await signIn(page, ctx, v, account);
            for (const screen of screens.filter((s) => s.as === account)) {
              const name = shotName(screen, v);
              const { png, settled, ignore } = await shoot(page, ctx, screen, v);
              const file = shotPath(ctx.runDir, 'web', device.id, name);
              writeFileSync(file, png);
              if (ignore.length) writeFileSync(ignorePath(file), JSON.stringify(ignore));
              if (!settled) unsettled.push(`web/${device.id}/${name}`);
              ctx.log(`  web/${device.id}/${name}${settled ? '' : '  (never settled)'}`);
            }
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  return unsettled;
};

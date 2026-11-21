/**
 * The web's captures: Playwright's own Chromium (pinned by the playwright
 * version, so a browser update never moves a pixel) at three fixed sizes, each
 * with its device scale, colour scheme and locale set, reduced motion on, CSS
 * animations finished and the caret hidden. Each account signs in once per
 * device and variant (`window.__emulatorSignIn`, which emulator builds expose).
 * The landing film is held at its moment (`?rest=1&t=`, screens.ts) with its
 * cast on stage; its pinned stills go to the run's `_glance/` (looked at, not
 * compared).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright';
import { unspendHints, webStorageOf } from './hints';
import { SCREENS, screensFor, shotName, type Account, type Screen, type Variant } from './screens';
import { lookNote, secondLook, type Look } from './secondLook';
import { GLANCE_DIR, SEED_PASSWORD, ignorePath, settle, shotPath, type Capture, type CaptureContext, type Rect } from './util';
import { devicesFor, groups, plan } from './variants';
import { checksPath, consoleNoise, judgePage, measurePage, type Finding } from './webChecks';

export type WebDevice = { id: string; phone: boolean; width: number; height: number; touch: boolean };

export const WEB_DEVICES: WebDevice[] = [
  { id: 'phone', phone: true, width: 390, height: 844, touch: true },
  { id: 'tablet', phone: false, width: 820, height: 1180, touch: true },
  { id: 'desktop', phone: false, width: 1440, height: 900, touch: false },
];

/** Next's dev-mode badge, and anything else a dev build draws that production doesn't. */
const HIDE_DEV_CHROME = 'nextjs-portal{display:none!important}';

/** A browser context as the captures make one (shared with the web flows, webFlows.ts). */
export async function newContext(browser: Browser, device: WebDevice, v: Variant): Promise<BrowserContext> {
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
  // The paper puppets load (`/mascots/`): they are the landing film's cast. (The old landing stage, whose visits
  // came and went at random, had them kept away; no captured page has it now, and the reading stage is off.)
  await context.addInitScript((css) => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, HIDE_DEV_CHROME);
  return context;
}

/** Signs `account` in on the emulator build (`window.__emulatorSignIn`) and waits for the session cookie (shared with webFlows.ts). */
export async function signIn(page: Page, ctx: Pick<CaptureContext, 'devUrl' | 'log'>, v: Variant, account: Account) {
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

/** The console's errors and the uncaught exceptions since the page's screen began (webChecks.ts), less the capture's own. */
const errors = new WeakMap<Page, string[]>();
function trackErrors(page: Page) {
  const list: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' || consoleNoise(m.text(), m.location().url)) return;
    // A resource that failed says which, so an expected answer (the 404 page's own 404) can be told apart.
    list.push(/^Failed to load resource/.test(m.text()) ? `${m.text()} — ${m.location().url}` : m.text());
  });
  page.on('pageerror', (e) => list.push(`${e.name}: ${e.message}`));
  return list;
}

/** Every key any screen writes to the site's localStorage (`web.storage`, its hints' counts). */
const STORED = [...new Set(SCREENS.flatMap((s) => Object.keys(webStorageOf(s))))];

/**
 * What this browser keeps for `screen` (its `web.storage`, its hints at 0: hints.ts), written on the site's own origin before
 * its page opens; what another screen kept is taken away first, so nothing of one screen (a draft)
 * shows on the next. The page is on the site already (signed in, or the last screen).
 */
async function keep(page: Page, screen: Screen) {
  const wanted = webStorageOf(screen);
  if (!STORED.length || !page.url().startsWith('http')) return;
  await page.evaluate(
    ([keys, set]) => {
      for (const key of keys) if (!(key in set)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(set)) localStorage.setItem(key, value);
    },
    [STORED, wanted] as const,
  );
}

/**
 * Opens a screen's page. A navigation the last page starts by itself while this one begins (the sign-in
 * page on a phone reloads itself once for its popup) aborts this one: it is asked for again, twice at most.
 */
async function open(page: Page, ctx: CaptureContext, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      return;
    } catch (error) {
      if (attempt > 2 || !/net::ERR_ABORTED/.test(String(error))) throw error;
      ctx.log(`  ${url}: the navigation was aborted, asking again`);
      await page.waitForTimeout(1000);
    }
  }
}

async function shoot(
  page: Page,
  ctx: CaptureContext,
  screen: Screen,
  v: Variant,
  device: WebDevice,
  key: string,
): Promise<Look & { ignore: Rect[]; findings: Finding[] }> {
  if (!idle.has(page)) idle.set(page, trackRequests(page));
  if (!errors.has(page)) errors.set(page, trackErrors(page));
  // `next dev` reloads every open page in full when it compiles something new (Fast Refresh), and its
  // 404 page navigates to itself once more after loading, now and then staying empty: a page that
  // navigated while it was being taken, or came up with no words and no picture, is taken again.
  let navigated = false;
  const onNavigation = (frame: Frame) => frame === page.mainFrame() && (navigated = true);
  page.on('framenavigated', onNavigation);
  try {
    for (let attempt = 1; ; attempt++) {
      const look = await shootOnce(page, ctx, screen, v, device, key, () => (navigated = false));
      const blank = look.findings.some((f) => f.check === 'blank');
      if ((!navigated && !blank) || attempt === 3) return look;
      ctx.log(`  ${key}: ${blank ? 'the page came up empty' : 'the page reloaded itself while it was taken'}, taking it again`);
    }
  } finally {
    page.off('framenavigated', onNavigation);
  }
}

async function shootOnce(
  page: Page,
  ctx: CaptureContext,
  screen: Screen,
  v: Variant,
  device: WebDevice,
  key: string,
  /** Called once the page is ready: what navigates after it spoils the capture. */
  watch: () => void,
): Promise<Look & { ignore: Rect[]; findings: Finding[] }> {
  errors.get(page)!.length = 0;
  // Its hints unspent for its account on the stack (hints.ts), before the page reads the profile.
  await unspendHints(ctx, screen);
  await keep(page, screen);
  const route = screen.web?.route ?? screen.route;
  const query = screen.web?.query ? `?${screen.web.query}` : '';
  await open(page, ctx, `${ctx.devUrl}/${v.locale}${route === '/' ? '' : route}${query}`);
  const ready = async () => {
    await idle.get(page)!();
    await page.evaluate(() => document.fonts.ready);
    // A shape not yet measured shows its CSS stand-in: wait for the drawn one.
    await page.waitForFunction(() => !document.querySelector('[data-shape-pending]'), null, { timeout: 15_000 }).catch(() => {});
  };
  await ready();
  if (await page.locator('[data-film-root]').count()) {
    // The landing film: its runtime ready (摺摺 and 點點 live), then the rest of its cast on stage (the others go live
    // on idle, by 20 s at the latest) — film checks say so when one never did.
    await page.waitForFunction(() => (window as { __film?: { ready: boolean } }).__film?.ready, null, { timeout: 60_000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[data-actor]:not([data-live])'), null, { timeout: 30_000 }).catch(() => {});
  }
  if (screen.web?.click) {
    // The first one on screen: a phone and a desktop header may both be in the page, CSS showing one.
    await page.locator(screen.web.click).locator('visible=true').first().click();
    await ready();
  }
  if (screen.web?.scrollTo) {
    await page.evaluate((to) => {
      if (to === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight);
      else document.querySelector(to)?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    }, screen.web.scrollTo);
    await ready();
  }
  watch();
  const mask = (screen.mask ?? []).map((s) => page.locator(s));
  const take = () =>
    settle(() => page.screenshot({ fullPage: screen.fullPage, animations: 'disabled', caret: 'hide', mask, scale: 'device' }), {
      timeoutMs: 30_000,
      intervalMs: 600,
    });
  const first = await take();
  const ignore = await ignored(page, !!screen.fullPage);
  const look = await secondLook(first, take, { key, ignore });
  const measure = await measurePage(page, { touch: device.touch, phone: device.phone, frames: screen.web?.frames });
  const findings = judgePage(measure, errors.get(page)!, { touch: device.touch, scene: screen.film?.scene });
  return { ...look, ignore: look.retaken ? await ignored(page, !!screen.fullPage) : ignore, findings };
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

/**
 * Asks once for every page the screens open, before any is captured: `next dev` compiles a route on
 * its first request and then reloads every open page in full, which would land on a capture.
 */
async function warmUp(ctx: CaptureContext, screens: Screen[]) {
  ctx.log('  compiling the pages the screens open…');
  for (const route of new Set(screens.map((s) => s.web?.route ?? s.route))) {
    if (route != null) await fetch(`${ctx.devUrl}/zh-TW${route === '/' ? '' : route}`).catch(() => {});
  }
}

export const captureWeb: Capture = async (ctx) => {
  const browser = await chromium.launch();
  const unsettled: string[] = [];
  const set = ctx.set ?? 'release';
  try {
    await warmUp(ctx, screensFor('web', ctx.only, set === 'extended'));
    for (const id of devicesFor('web', set, ctx.devices)) {
      const device = WEB_DEVICES.find((d) => d.id === id)!;
      // By variant and account (variants.ts): one context per account, so a signed-out screen never sees
      // someone's session. The film's stills are light zh-TW only (their art is the same in both schemes and languages).
      for (const { variant: v, account, screens } of groups(plan('web', id, set, ctx.only))) {
        const context = await newContext(browser, device, v);
        const page = await context.newPage();
        try {
          if (account) await signIn(page, ctx, v, account);
          for (const screen of screens) {
            const name = shotName(screen, v);
            const key = `web/${device.id}/${name}`;
            const look = await shoot(page, ctx, screen, v, device, key);
            const file = shotPath(screen.film ? join(ctx.runDir, GLANCE_DIR) : ctx.runDir, 'web', device.id, name);
            writeFileSync(file, look.png);
            if (look.ignore.length) writeFileSync(ignorePath(file), JSON.stringify(look.ignore));
            if (look.findings.length) writeFileSync(checksPath(file), JSON.stringify(look.findings, null, 2));
            if (!look.settled) unsettled.push(key);
            if (look.retaken) ctx.retaken.push(key);
            const checks = look.findings.length ? `  (${look.findings.map((f) => f.check).join(', ')})` : '';
            ctx.log(`  ${key}${lookNote(look)}${checks}`);
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return unsettled;
};

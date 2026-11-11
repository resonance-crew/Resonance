#!/usr/bin/env node
/**
 * The scene changes, captured exactly (script/changes: one style per `?change=<name>`): Playwright Chromium against
 * the lab dev server, the film resting (`?rest=1`: no idle life, the acts pure scrub), every frame reached by
 * `window.__film.seek(s)` — so a frame is a function of s alone and the same p always gives the same picture.
 *
 *   node designs/landing-lab/film/tools/changes.mjs --variant <name> [--sizes phone,desktop,tablet] [--out <dir>]
 *     [--query k=v&k2=v2] [--changes c1,c2,c3] [--steps 10] [--fps 30] [--no-video] [--no-sheets]
 *     [--locale zh-TW] [--scheme light|dark] [--base http://localhost:3200]
 *
 * For each size it writes:
 * - one sheet per change, `c1-phone.png` …: the change at p = 0, 0.1 … 1 (`--steps` + 1 frames), each labelled with
 *   its p and its film time;
 * - one sweep video, `sweep-phone.mp4` …: each change in turn — a second of the scene before it (s t0 − 1 → t0), the
 *   change scrubbed p 0 → 1 (1.5 s), a second of the scene after it (s t1 → t1 + 1), the same back again (t1 + 1 → t1,
 *   p 1 → 0, t0 → t0 − 1) — at `--fps`, H.264, yuv420p, faststart. A small label at the foot says where it is.
 * Console errors and any horizontal overflow go to `errors.json` and are printed at the end.
 * Sizes: phone 390×844 (touch), tablet 820×1180 (touch), tabletL 1180×820, desktop 1440×900, laptop 1366×768,
 * narrow 320×640 (touch). Frames are taken at CSS pixels (`scale: 'css'`).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '/Users/ncchen/Documents/Resonance-landing/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const flag = (k) => args.includes(`--${k}`);

const variant = opt('variant', 'legacy');
const base = opt('base', 'http://localhost:3200');
const out = opt('out', `/private/tmp/claude-501/-Users-ncchen--claude-spares-spare-pZgTcm/84b65950-01bf-4833-b134-c3a6994644eb/scratchpad/film/build2/changes/${variant}`);
const sizes = opt('sizes', 'phone,desktop,tablet').split(',');
const changes = opt('changes', 'c1,c2,c3').split(',');
const query = opt('query', '');
const locale = opt('locale', 'zh-TW');
const scheme = opt('scheme', 'light');
const steps = Math.max(1, Number(opt('steps', '10')));
const fps = Math.max(10, Number(opt('fps', '30')));
mkdirSync(out, { recursive: true });

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tabletL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  narrow: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** A sheet's thumbnail scale and columns, by size. */
const SHEET = {
  phone: { k: 0.55, cols: 6 },
  narrow: { k: 0.62, cols: 6 },
  tablet: { k: 0.3, cols: 6 },
  tabletL: { k: 0.3, cols: 4 },
  desktop: { k: 0.32, cols: 4 },
  laptop: { k: 0.34, cols: 4 },
};

const errors = [];
const written = [];
const browser = await chromium.launch();

/** Seeks the resting film to s and waits until it has drawn it (two frames after the clock is there). */
async function seekTo(page, s) {
  await page.evaluate(async (t) => {
    window.__film.seek(t);
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < 30; i++) {
      await raf();
      if (Math.abs(window.__film.state().s - t) < 0.004) break;
    }
    await raf();
    await raf();
  }, s);
}

async function label(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('__chg_label');
    if (!el) {
      el = document.createElement('div');
      el.id = '__chg_label';
      el.style.cssText =
        'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;' +
        'font:600 11px/1.3 ui-monospace,Menlo,monospace;color:#fff;background:rgba(10,10,20,.62);padding:3px 8px;border-radius:6px;white-space:nowrap';
      document.body.append(el);
    }
    el.textContent = t;
    el.hidden = !t;
  }, text);
}

const sheetHtml = (title, frames, w, h, k, cols) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#16161c;color:#eee;font:13px/1.3 ui-monospace,Menlo,monospace}
  h1{font-size:14px;font-weight:600;margin:0;padding:10px 12px 4px}
  .g{display:grid;grid-template-columns:repeat(${cols},${Math.round(w * k)}px);gap:8px;padding:8px 12px 12px}
  figure{margin:0}
  img{display:block;width:${Math.round(w * k)}px;height:${Math.round(h * k)}px;outline:1px solid #333}
  figcaption{padding:3px 0 0;color:#cfcfd8}
</style></head><body><h1>${title}</h1><div class="g">${frames
  .map((f) => `<figure><img src="data:image/png;base64,${f.png.toString('base64')}"><figcaption>${f.caption}</figcaption></figure>`)
  .join('')}</div></body></html>`;

try {
  const sheetCtx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const sheetPage = await sheetCtx.newPage();
  for (const size of sizes) {
    const S = SIZES[size];
    if (!S) {
      errors.push({ size, text: 'unknown size' });
      continue;
    }
    const ctx = await browser.newContext({ ...S, colorScheme: scheme, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => {
      const add = () => {
        const s = document.createElement('style');
        s.textContent = 'nextjs-portal{display:none!important}';
        document.documentElement.append(s);
      };
      if (document.documentElement) add();
      else document.addEventListener('DOMContentLoaded', add);
    });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push({ size, text: m.text().slice(0, 400) });
    });
    page.on('pageerror', (e) => errors.push({ size, text: `pageerror: ${e.message}` }));
    const url = `${base}/${locale}/lab/landing/film?change=${encodeURIComponent(variant)}&rest=1${query ? `&${query}` : ''}`;
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 30000 }).catch(() => errors.push({ size, text: 'never ready' }));
    await page.evaluate(() => document.fonts.ready);
    // every puppet live before the first frame (the cast loads on idle)
    await seekTo(page, 22);
    await page.waitForTimeout(1500);
    const segs = Object.fromEntries((await page.evaluate(() => window.__film.segments())).map((s) => [s.id, s]));
    const { width: W, height: H } = S.viewport;

    // ── the sheets ──
    if (!flag('no-sheets')) {
      await label(page, '');
      for (const c of changes) {
        const seg = segs[c];
        if (!seg) continue;
        const frames = [];
        for (let i = 0; i <= steps; i++) {
          const p = i / steps;
          const s = seg.t0 + p * (seg.t1 - seg.t0);
          await seekTo(page, s);
          const png = await page.screenshot({ scale: 'css', type: 'png' });
          frames.push({ png, caption: `${c} · p ${p.toFixed(2)} · s ${s.toFixed(2)}` });
        }
        const { k, cols } = SHEET[size] ?? { k: 0.3, cols: 4 };
        await sheetPage.setViewportSize({ width: Math.round(cols * (W * k + 8) + 24), height: 600 });
        await sheetPage.setContent(sheetHtml(`${variant} · ${c} (s ${seg.t0}–${seg.t1}) · ${size} ${W}×${H} · ${locale} ${scheme}${query ? ` · ${query}` : ''}`, frames, W, H, k, cols));
        const file = join(out, `${c}-${size}.png`);
        await sheetPage.screenshot({ path: file, fullPage: true });
        written.push(file);
      }
    }

    // ── the sweep video ──
    if (!flag('no-video')) {
      const dir = join(out, `.frames-${size}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let n = 0;
      const shoot = async (s, text) => {
        await seekTo(page, s);
        await label(page, text);
        await page.screenshot({ path: join(dir, `${String(n++).padStart(5, '0')}.png`), scale: 'css', type: 'png' });
      };
      const run = async (count, fn) => {
        for (let i = 0; i < count; i++) await fn(count === 1 ? 1 : i / (count - 1));
      };
      for (const c of changes) {
        const seg = segs[c];
        if (!seg) continue;
        const { t0, t1 } = seg;
        const at = (p) => t0 + p * (t1 - t0);
        const tag = (s) => `${variant} · ${c} · s ${s.toFixed(2)}`;
        const tagP = (p) => `${variant} · ${c} · p ${p.toFixed(2)}`;
        await run(fps, (u) => shoot(t0 - 1 + u, tag(t0 - 1 + u)));
        await run(Math.round(1.5 * fps), (u) => shoot(at(u), tagP(u)));
        await run(fps, (u) => shoot(t1 + u, tag(t1 + u)));
        await run(fps, (u) => shoot(t1 + 1 - u, tag(t1 + 1 - u)));
        await run(Math.round(1.5 * fps), (u) => shoot(at(1 - u), tagP(1 - u)));
        await run(fps, (u) => shoot(t0 - u, tag(t0 - u)));
      }
      await label(page, '');
      const file = join(out, `sweep-${size}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, '%05d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', '-an', file]);
      rmSync(dir, { recursive: true, force: true });
      written.push(file);
    }

    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (scrollW > 0) errors.push({ size, text: `horizontal overflow ${scrollW}px` });
    await ctx.close();
  }
  await sheetCtx.close();
} finally {
  await browser.close();
}
writeFileSync(join(out, 'errors.json'), JSON.stringify(errors, null, 2));
console.log(written.join('\n'));
if (errors.length) console.log(`\n${errors.length} problem(s):\n` + errors.map((e) => `[${e.size}] ${e.text}`).join('\n'));

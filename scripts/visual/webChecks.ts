/**
 * What the web's pass asserts on each page it captures, beyond the picture. It already walks every
 * screen at three sizes and five variants; these turn that walk into checks a script can read:
 *
 *   blank          the page shows no words and no picture (a failed render, a page caught mid-reload)
 *   overflow       the page is wider than the window (something runs off a phone's edge)
 *   wrapped-label  a short button's words break onto a second line
 *   console        an error in the browser's console, or an uncaught exception, while the page loaded
 *   touch-target   on a touch screen, a control smaller than 44 × 44 (a link inside running text aside)
 *   contrast       words under WCAG AA on what they stand on (`window.__contrastAudit()`, dev builds)
 *   film           on the landing film's pages: the runtime never ready, a puppet never on stage, or a pinned
 *                  still standing in another scene than its screen says (`film` in screens.ts)
 *   film-frames    the film scrolled through from its top drew slowly (`__film.stats()`; a dev build's numbers)
 *   phone-bands    on the phone, a card in a list or a band that stops short of the window's edges: a phone's
 *                  lists are bands, not cards (CLAUDE.md, Phone, tablet and Mac) — the framed card was shipped twice
 *
 * The page only measures (`measurePage`); judging is plain code (`judgePage`), tested on its own.
 * A check fails a run only once it has been seen clean, or every run fails and the gate is ignored:
 * `blank` (never right) and the two a full web run found nothing for (2026-11-13) fail; the rest
 * warn until a run shows none of them (or what it shows is fixed), then go to `fail` in WEB_CHECKS.
 * A capture's findings are written beside it (`<capture>.checks.json`); gate.ts and the report read them.
 */
import type { Page } from 'playwright';

export type WebCheck = 'blank' | 'overflow' | 'wrapped-label' | 'console' | 'touch-target' | 'contrast' | 'film' | 'film-frames' | 'phone-bands';
export type Level = 'fail' | 'warn';
export type Finding = { check: WebCheck; level: Level; detail: string };

export const WEB_CHECKS: Record<WebCheck, { level: Level; what: string }> = {
  blank: { level: 'fail', what: 'the page shows no words and no picture' },
  overflow: { level: 'fail', what: 'the page is wider than the window' },
  'wrapped-label': { level: 'fail', what: "a short button's words break onto two lines" },
  console: { level: 'warn', what: 'an error in the console while the page loaded' },
  'touch-target': { level: 'warn', what: 'a control smaller than 44 × 44 on a touch screen' },
  contrast: { level: 'warn', what: 'words under WCAG AA contrast' },
  film: { level: 'fail', what: "the landing film not ready, its cast not on stage, or a still in another scene" },
  'film-frames': { level: 'warn', what: 'the landing film drew slowly when scrolled through (a dev build)' },
  // Warn until a full web run shows it clean (the README's rule for a new check), then fail.
  'phone-bands': { level: 'warn', what: "on a phone, a list's card or band that doesn't run edge to edge" },
};

/** Frame times past which a scroll through the film is called slow: p95 over two 60 Hz frames, or one frame in ten over 50 ms. */
export const SLOW_P95_MS = 34;
export const SLOW_SHARE = 0.1;

/** A control's smallest side on a touch screen (Apple's 44 pt; the house's 44-tall rows and buttons). */
export const MIN_TARGET = 44;
/** Longer words than this on a button are a sentence, which may wrap. */
export const SHORT_LABEL = 40;

export const checksPath = (png: string) => png.replace(/\.png$/, '.checks.json');

export type Box = { top: number; bottom: number };
export type PageMeasure = {
  /** No words and no picture on the page (web.ts takes it again; still so, it fails the run). */
  blank: boolean;
  /** The window's width (the document's client width) and how wide the page scrolls. */
  viewport: number;
  scrollWidth: number;
  /** The outermost things past the window's right edge, when the page is too wide. */
  pastEdge: { name: string; right: number }[];
  /** Each short button's words, as the boxes of their lines of text. */
  labels: { text: string; boxes: Box[] }[];
  /** Controls under MIN_TARGET on either side (touch screens only). */
  small: { name: string; width: number; height: number }[];
  /**
   * On the phone: a list's cards (an `article` beside another, a card grid's items; a framed one — `data-framed`,
   * the landing film's — aside) and the bands' washes (`[data-band]`) that stop short of either edge of the window.
   * Absent in older captures' measures.
   */
  framed?: { name: string; left: number; right: number }[];
  /** `window.__contrastAudit()`'s failures, when the build has it. */
  contrast: { text: string; ratio: number; min: number; where: string }[] | null;
  /** The landing film's handle (`window.__film`), when the page has one; `frames` after a scroll through it. */
  film: {
    ready: boolean;
    scene: number;
    resting: boolean;
    actors: number;
    live: number;
    frames?: { frames: number; p50: number; p95: number; long: number };
  } | null;
};

/** How many lines a set of text boxes makes: boxes overlapping by half the smaller one's height share a line. */
export function lineCount(boxes: Box[]): number {
  const lines: Box[] = [];
  for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
    const line = lines.find((l) => Math.min(l.bottom, box.bottom) - Math.max(l.top, box.top) > Math.min(l.bottom - l.top, box.bottom - box.top) / 2);
    if (line) {
      line.top = Math.min(line.top, box.top);
      line.bottom = Math.max(line.bottom, box.bottom);
    } else lines.push({ ...box });
  }
  return lines.length;
}

/** A console error the capture causes itself: the paper puppets' requests, aborted on purpose (web.ts). */
export function consoleNoise(text: string, url: string): boolean {
  return /\/mascots\//.test(url) || /\/mascots\//.test(text);
}

const finding = (check: WebCheck, detail: string): Finding => ({ check, level: WEB_CHECKS[check].level, detail });
const list = <T>(items: T[], show: (item: T) => string, max = 5) =>
  items.slice(0, max).map(show).join(', ') + (items.length > max ? `, and ${items.length - max} more` : '');

export function judgePage(m: PageMeasure, consoleErrors: string[], { touch, scene }: { touch: boolean; scene?: number }): Finding[] {
  const out: Finding[] = [];
  if (m.blank) out.push(finding('blank', 'the page shows no words and no picture'));
  if (m.scrollWidth > m.viewport + 1) {
    const past = m.pastEdge.length ? ` — past the edge: ${list(m.pastEdge, (p) => `${p.name} (to ${Math.round(p.right)})`, 3)}` : '';
    out.push(finding('overflow', `the page is ${m.scrollWidth} px wide in a ${m.viewport} px window${past}`));
  }
  for (const label of m.labels) {
    const lines = lineCount(label.boxes);
    if (lines > 1) out.push(finding('wrapped-label', `“${label.text}” breaks onto ${lines} lines`));
  }
  const errors = [...new Set(consoleErrors.map((e) => e.replace(/\s+/g, ' ').trim().slice(0, 200)))];
  if (errors.length) out.push(finding('console', list(errors, (e) => e, 3)));
  if (m.framed?.length) {
    out.push(finding('phone-bands', `${m.framed.length} not edge to edge: ${list(m.framed, (f) => `${f.name} (${Math.round(f.left)}–${Math.round(f.right)} of ${m.viewport})`, 3)}`));
  }
  if (touch && m.small.length) {
    out.push(finding('touch-target', `${m.small.length} under ${MIN_TARGET} × ${MIN_TARGET}: ${list(m.small, (s) => `${s.name} (${Math.round(s.width)} × ${Math.round(s.height)})`)}`));
  }
  if (m.contrast?.length) {
    out.push(finding('contrast', `${m.contrast.length} under AA: ${list(m.contrast, (c) => `“${c.text}” ${c.ratio.toFixed(2)}:1 (needs ${c.min}) at ${c.where}`, 3)}`));
  }
  const film = m.film;
  if (film) {
    const wrong = [
      !film.ready ? 'the runtime never said it was ready' : null,
      film.live < film.actors ? `${film.actors - film.live} of ${film.actors} puppets never came on stage` : null,
      scene != null && film.scene !== scene ? `it stands in scene ${film.scene}, not ${scene}` : null,
    ].filter(Boolean);
    if (wrong.length) out.push(finding('film', wrong.join('; ')));
    const f = film.frames;
    if (f?.frames && (f.p95 > SLOW_P95_MS || f.long / f.frames > SLOW_SHARE)) {
      out.push(finding('film-frames', `scrolled through: p95 ${Math.round(f.p95)} ms, ${f.long} of ${f.frames} frames over 50 ms`));
    }
  } else if (scene != null) {
    out.push(finding('film', 'no landing film on the page'));
  }
  return out;
}

/**
 * What the page shows, measured in the browser (a self-contained function: Playwright sends its source).
 * tsx compiles named functions with esbuild's keepNames, wrapping each in `__name(…)`, a helper the
 * page doesn't have: it is given a stand-in first (a string, so nothing compiles it).
 */
export async function measurePage(page: Page, { touch, phone = false, frames = false }: { touch: boolean; phone?: boolean; frames?: boolean }): Promise<PageMeasure> {
  await page.evaluate('globalThis.__name ??= (fn) => fn');
  return page.evaluate(
    async ({ touch, phone, minTarget, shortLabel, frames }) => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && !el.closest('[aria-hidden="true"], [inert]');
      };
      const nameOf = (el: Element) => {
        const words = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ');
        if (words) return words.slice(0, 30);
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean)[0] : '';
        return el.tagName.toLowerCase() + (cls ? `.${cls}` : '');
      };
      const blank = !document.body || (document.body.innerText.trim() === '' && !document.querySelector('img, svg, canvas, video'));
      const root = document.documentElement;
      const viewport = root.clientWidth;
      const scrollWidth = root.scrollWidth;

      const pastEdge: { name: string; right: number }[] = [];
      if (scrollWidth > viewport + 1) {
        const clips = (el: Element | null): boolean => {
          for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible') return true;
          }
          return false;
        };
        const past = (el: Element) => el.getBoundingClientRect().right > viewport + 1 && visible(el) && !clips(el);
        for (const el of document.body.querySelectorAll('*')) {
          if (pastEdge.length >= 5) break;
          if (past(el) && !(el.parentElement && el.parentElement !== document.body && past(el.parentElement))) {
            pastEdge.push({ name: nameOf(el), right: el.getBoundingClientRect().right });
          }
        }
      }

      const labels: { text: string; boxes: { top: number; bottom: number }[] }[] = [];
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        if (!visible(el)) continue;
        const text = ((el as HTMLElement).innerText || '').trim();
        if (!text || text.length > shortLabel || text.includes('\n')) continue;
        const boxes: { top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width >= 2 && r.height >= 4) boxes.push({ top: r.top, bottom: r.bottom });
        }
        labels.push({ text, boxes });
      }

      const small: { name: string; width: number; height: number }[] = [];
      if (touch) {
        const controls = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], input:not([type="hidden"]), select, textarea, summary';
        for (const el of document.querySelectorAll(controls)) {
          if (!visible(el) || (el as HTMLButtonElement).disabled) continue;
          // A link inside running text is exempt (WCAG 2.5.8's inline exception).
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && (el.parentElement?.textContent ?? '').trim().length > (el.textContent ?? '').trim().length) continue;
          const r = el.getBoundingClientRect();
          if (r.width < minTarget || r.height < minTarget) small.push({ name: nameOf(el), width: r.width, height: r.height });
        }
      }

      const framed: { name: string; left: number; right: number }[] = [];
      if (phone) {
        // Not inside a dialog or a menu (their rows sit on the dialog's paper), nor the landing film's stage.
        const aside = (el: Element) => !!el.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-film-root]');
        const cards = [...document.querySelectorAll('article')].filter(
          (el) => !el.hasAttribute('data-framed') && !aside(el) && ([...(el.parentElement?.children ?? [])].some((c) => c !== el && c.tagName === 'ARTICLE') || !!el.closest('[data-card-grid]')),
        );
        // A band's wash may rest see-through: its box is what counts, so not `visible` (which asks for opacity).
        const bands = [...document.querySelectorAll('[data-band]')].filter((el) => !aside(el) && !el.closest('[aria-hidden="true"]:not([data-band])'));
        for (const el of [...cards.filter(visible), ...bands]) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
          if (r.left > 1 || r.right < viewport - 1) framed.push({ name: nameOf(el.closest('a, [role="button"], li, article') ?? el), left: r.left, right: r.right });
          if (framed.length >= 10) break;
        }
      }

      type Audit = { failures: { text: string; ratio: number; min: number; where: string }[] };
      const audit = (window as unknown as { __contrastAudit?: () => Promise<Audit> }).__contrastAudit;
      const contrast = audit ? (await audit().catch(() => null))?.failures.map(({ text, ratio, min, where }) => ({ text, ratio, min, where })) ?? null : null;

      type FilmHandle = { ready: boolean; state: () => { scene: number; resting: boolean }; stats: () => { frames: number; p50: number; p95: number; long: number } };
      const handle = (window as unknown as { __film?: FilmHandle }).__film;
      let film: PageMeasure['film'] = null;
      if (handle) {
        const state = handle.state();
        film = {
          ready: !!handle.ready,
          scene: state.scene,
          resting: state.resting,
          actors: document.querySelectorAll('[data-actor]').length,
          live: document.querySelectorAll('[data-actor][data-live]').length,
        };
        const stage = document.querySelector('[data-film-root]');
        if (frames && stage) {
          // A third of a window at a time, two frames each, from the film's top to its end: what a reader's scroll asks for.
          const next = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          const before = handle.stats();
          const end = stage.getBoundingClientRect().bottom + window.scrollY;
          for (let y = 0; y < end; y += window.innerHeight / 3) {
            window.scrollTo(0, y);
            await next();
          }
          const after = handle.stats();
          window.scrollTo(0, 0);
          await next();
          film.frames = { frames: after.frames - before.frames, p50: after.p50, p95: after.p95, long: after.long - before.long };
        }
      }

      return { blank, viewport, scrollWidth, pastEdge, labels, small, framed, contrast, film };
    },
    { touch, phone, minTarget: MIN_TARGET, shortLabel: SHORT_LABEL, frames },
  );
}

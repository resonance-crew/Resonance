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
 *
 * The page only measures (`measurePage`); judging is plain code (`judgePage`), tested on its own.
 * A check fails a run only once it has been seen clean, or every run fails and the gate is ignored:
 * `blank` (never right) and the two a full web run found nothing for (2026-11-13) fail; the rest
 * warn until a run shows none of them (or what it shows is fixed), then go to `fail` in WEB_CHECKS.
 * A capture's findings are written beside it (`<capture>.checks.json`); gate.ts and the report read them.
 */
import type { Page } from 'playwright';

export type WebCheck = 'blank' | 'overflow' | 'wrapped-label' | 'console' | 'touch-target' | 'contrast';
export type Level = 'fail' | 'warn';
export type Finding = { check: WebCheck; level: Level; detail: string };

export const WEB_CHECKS: Record<WebCheck, { level: Level; what: string }> = {
  blank: { level: 'fail', what: 'the page shows no words and no picture' },
  overflow: { level: 'fail', what: 'the page is wider than the window' },
  'wrapped-label': { level: 'fail', what: "a short button's words break onto two lines" },
  console: { level: 'warn', what: 'an error in the console while the page loaded' },
  'touch-target': { level: 'warn', what: 'a control smaller than 44 × 44 on a touch screen' },
  contrast: { level: 'warn', what: 'words under WCAG AA contrast' },
};

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
  /** `window.__contrastAudit()`'s failures, when the build has it. */
  contrast: { text: string; ratio: number; min: number; where: string }[] | null;
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

export function judgePage(m: PageMeasure, consoleErrors: string[], { touch }: { touch: boolean }): Finding[] {
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
  if (touch && m.small.length) {
    out.push(finding('touch-target', `${m.small.length} under ${MIN_TARGET} × ${MIN_TARGET}: ${list(m.small, (s) => `${s.name} (${Math.round(s.width)} × ${Math.round(s.height)})`)}`));
  }
  if (m.contrast?.length) {
    out.push(finding('contrast', `${m.contrast.length} under AA: ${list(m.contrast, (c) => `“${c.text}” ${c.ratio.toFixed(2)}:1 (needs ${c.min}) at ${c.where}`, 3)}`));
  }
  return out;
}

/**
 * What the page shows, measured in the browser (a self-contained function: Playwright sends its source).
 * tsx compiles named functions with esbuild's keepNames, wrapping each in `__name(…)`, a helper the
 * page doesn't have: it is given a stand-in first (a string, so nothing compiles it).
 */
export async function measurePage(page: Page, { touch }: { touch: boolean }): Promise<PageMeasure> {
  await page.evaluate('globalThis.__name ??= (fn) => fn');
  return page.evaluate(
    async ({ touch, minTarget, shortLabel }) => {
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

      type Audit = { failures: { text: string; ratio: number; min: number; where: string }[] };
      const audit = (window as unknown as { __contrastAudit?: () => Promise<Audit> }).__contrastAudit;
      const contrast = audit ? (await audit().catch(() => null))?.failures.map(({ text, ratio, min, where }) => ({ text, ratio, min, where })) ?? null : null;

      return { blank, viewport, scrollWidth, pastEdge, labels, small, contrast };
    },
    { touch, minTarget: MIN_TARGET, shortLabel: SHORT_LABEL },
  );
}

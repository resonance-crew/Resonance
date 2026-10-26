/**
 * `window.__contrastAudit()` — dev and emulator builds only (TweaksPanel
 * installs it behind the same gate the emulator sign-in uses, so a production
 * bundle never carries it). It walks the text on screen, finds what each piece
 * actually stands on — the CSS backgrounds and the hand-drawn SVG papers under
 * it, translucent layers composited down to the first opaque one — and lists
 * the words under WCAG AA (4.5:1, 3:1 for large text), the words over a
 * picture or a canvas (which it can't judge), and in dark the bright islands:
 * opaque surfaces over L 0.8 larger than 64 × 64. The maths is ./contrast.
 *
 *   await window.__contrastAudit()                  // what is on screen now
 *   await window.__contrastAudit({ fullPage: true }) // scrolls the page through
 */
import { contrastRatio, flatten, hexOf, isBrightIsland, minimumRatio, oklabLightness, parseCssColor, type Rgba } from './contrast';
import { resolvedAccent, resolvedScheme } from './appearance';

export interface AuditFailure {
  text: string;
  ratio: number;
  min: number;
  fg: string;
  bg: string;
  where: string;
}

export interface AuditReport {
  scheme: string;
  accent: string;
  /** Words under their threshold. */
  failures: AuditFailure[];
  /** Words over a picture, a video or a canvas, which the audit can't read. */
  unknown: { text: string; over: string; where: string }[];
  /** In dark only: opaque light surfaces left on the night paper. */
  islands: { where: string; fill: string; L: number; size: string }[];
  checked: number;
}

/** A short name for an element: its tag, a class or two, its id. */
function describe(el: Element | null): string {
  if (!el) return '?';
  const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
}

const path = (el: Element | null) => {
  const out: string[] = [];
  for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) out.unshift(describe(e));
  return out.join(' > ');
};

/** A shape still fading in (res-shape-fade-in) is measured as it will stand: a hidden page never ends the fade. */
const fadingIn = (e: Element) =>
  e.classList.contains('res-shape-fade-in') && e.getAnimations().some((a) => (a as CSSAnimation).animationName === 'resShapeFadeIn');

/** The product of an element's own opacity and every ancestor's. */
function opacityOf(el: Element): number {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) if (!fadingIn(e)) o *= Number(getComputedStyle(e).opacity) || 0;
  return o;
}

/**
 * A grain layer (GrainOverlay, ShapeGrain, OrganiBlob's grain): a black shape
 * (only its alpha counts) through a noise filter — not a surface. A chalk
 * paper's filter is noise too, but over a real fill.
 */
function isGrain(el: Element, style: CSSStyleDeclaration, fill: Rgba | null): boolean {
  if (!fill || fill.r + fill.g + fill.b > 0.01) return false;
  const filter = el.getAttribute('filter') ?? (style.filter !== 'none' ? style.filter : '');
  const id = /url\(["']?#([^"')]+)/.exec(filter)?.[1];
  return !!id && !!document.getElementById(id)?.querySelector('feTurbulence');
}

/** The colours a gradient names, in order (a computed style writes each one out). */
const gradientStops = (css: string): Rgba[] =>
  (css.match(/(?:rgba?|oklch|oklab|color)\([^()]*\)/g) ?? []).map(parseCssColor).filter((c): c is Rgba => !!c);

type Layer = { colour: Rgba; el: Element } | { unknown: string; el: Element };

/** What an element paints at a point, as one layer (or none). */
function layerOf(el: Element): Layer | null {
  const style = getComputedStyle(el);
  const tag = el.tagName.toLowerCase();
  if (tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'image' || tag === 'iframe') return { unknown: tag, el };
  if (el instanceof SVGElement) {
    if (!['path', 'rect', 'circle', 'ellipse', 'polygon'].includes(tag)) return null;
    const fill = parseCssColor(style.fill);
    if (isGrain(el, style, fill)) return null;
    if (!fill || fill.a === 0) return style.fill.startsWith('url(') ? { unknown: 'gradient', el } : null;
    const a = fill.a * (Number(style.fillOpacity) || 0) * opacityOf(el);
    return a > 0.01 ? { colour: { ...fill, a }, el } : null;
  }
  let bg = parseCssColor(style.backgroundColor);
  const image = style.backgroundImage;
  if (image && image !== 'none') {
    // A story link's wave tile is decoration over the ground; a picture is a picture.
    if (/url\(/.test(image) && !/data:image\/svg/.test(image)) return { unknown: 'background-image', el };
    // A gradient (a fade, a veil): its most opaque stop stands for it.
    const stops = gradientStops(image);
    const solid = stops.reduce<Rgba | null>((best, c) => (!best || c.a > best.a ? c : best), null);
    if (solid && solid.a > (bg?.a ?? 0)) bg = solid;
  }
  if (!bg || bg.a === 0) return null;
  const a = bg.a * opacityOf(el);
  return a > 0.01 ? { colour: { ...bg, a }, el } : null;
}

/** Every visible piece of text in the viewport, with the element that draws it. */
function textPieces(): { el: Element; text: string; x: number; y: number }[] {
  const out: { el: Element; text: string; x: number; y: number }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const vw = innerWidth;
  const vh = innerHeight;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script, style, noscript, template, option, svg title')) continue;
    // A disabled control asks nothing of its contrast (WCAG 1.4.3's exception).
    if (el.closest(':disabled, [aria-disabled="true"]')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rect = Array.from(range.getClientRects()).find((r) => r.width > 1 && r.height > 1);
    if (!rect || rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || opacityOf(el) < 0.05) continue;
    // Screen-reader-only text (clipped to a pixel).
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    out.push({ el, text: n.textContent!.trim().slice(0, 40), x: Math.min(vw - 1, Math.max(0, rect.left + Math.min(rect.width / 2, 6))), y: Math.min(vh - 1, Math.max(0, rect.top + rect.height / 2)) });
  }
  return out;
}

/** The audit of what is on screen now. */
function auditViewport(report: AuditReport, seen: Set<string>): void {
  const dark = report.scheme === 'dark';
  const pieces = textPieces();
  for (const { el, text, x, y } of pieces) {
    const stack = document.elementsFromPoint(x, y);
    // What lies under the text's element (the element itself included: its own background).
    let at = stack.findIndex((s) => s === el || s.contains(el));
    if (at < 0) at = 0;
    const layers: Rgba[] = [];
    let over: string | null = null;
    for (const s of stack.slice(at)) {
      const layer = layerOf(s);
      if (!layer) continue;
      if ('unknown' in layer) {
        over = `${layer.unknown} (${describe(layer.el)})`;
        break;
      }
      layers.push(layer.colour);
      if (layer.colour.a >= 0.999) break;
    }
    const key = `${path(el)}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    report.checked++;
    if (over) {
      report.unknown.push({ text, over, where: path(el) });
      continue;
    }
    const style = getComputedStyle(el);
    const ground = flatten(layers);
    const ink = parseCssColor(el instanceof SVGElement ? style.fill : style.color);
    if (!ink) continue;
    const fg = flatten([{ ...ink, a: ink.a * opacityOf(el) }, ground]);
    const ratio = contrastRatio(fg, ground);
    const min = minimumRatio(parseFloat(style.fontSize) || 16, Number(style.fontWeight) || 400);
    if (ratio < min) report.failures.push({ text, ratio: Math.round(ratio * 100) / 100, min, fg: hexOf(fg), bg: hexOf(ground), where: path(el) });
  }
  if (!dark) return;
  // Bright islands: every opaque surface on screen, CSS or SVG.
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width <= 64 || r.height <= 64 || r.bottom < 0 || r.top > innerHeight) continue;
    const layer = layerOf(el);
    if (!layer || 'unknown' in layer) continue;
    if (!isBrightIsland(layer.colour, r.width, r.height)) continue;
    const key = `island|${path(el)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    report.islands.push({ where: path(el), fill: hexOf(layer.colour), L: Math.round(oklabLightness(layer.colour) * 100) / 100, size: `${Math.round(r.width)}×${Math.round(r.height)}` });
  }
}

// While it measures, every element answers a hit test (the hand-drawn papers' SVGs take no pointer at rest).
const AUDIT_STYLE = '*, *::before, *::after { pointer-events: auto !important; } svg *, svg { pointer-events: visiblePainted !important; }';

export async function contrastAudit({ fullPage = false, log = true }: { fullPage?: boolean; log?: boolean } = {}): Promise<AuditReport> {
  const report: AuditReport = { scheme: resolvedScheme(), accent: resolvedAccent(), failures: [], unknown: [], islands: [], checked: 0 };
  const seen = new Set<string>();
  const style = document.createElement('style');
  style.textContent = AUDIT_STYLE;
  document.head.appendChild(style);
  const startY = scrollY;
  try {
    if (!fullPage) auditViewport(report, seen);
    else {
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(200, innerHeight - 80)) {
        scrollTo({ top: y, behavior: 'instant' });
        // Past a frame and the shapes' fade-in (res-shape-fade-in, 280ms): a shape drawn anew as the page
        // scrolls (the header's, once something is under it) would otherwise be measured half there.
        await new Promise((r) => setTimeout(r, 360));
        auditViewport(report, seen);
      }
      scrollTo({ top: startY, behavior: 'instant' });
    }
  } finally {
    style.remove();
  }
  if (log) {
    console.info(`[contrast] ${report.scheme} / ${report.accent}: ${report.checked} pieces of text, ${report.failures.length} under AA, ${report.unknown.length} over a picture, ${report.islands.length} bright islands`);
    if (report.failures.length) console.table(report.failures);
    if (report.islands.length) console.table(report.islands);
  }
  return report;
}

/** Puts `__contrastAudit` on window (TweaksPanel calls this in dev and emulator builds only). */
export function installContrastAudit(): void {
  (window as unknown as { __contrastAudit?: typeof contrastAudit }).__contrastAudit = contrastAudit;
}

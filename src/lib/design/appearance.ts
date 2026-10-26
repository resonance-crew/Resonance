/**
 * Which theme and scheme the page wears, as `<html>` says it: `data-accent`
 * (absent: terracotta) and `data-scheme` (absent: the system's, through
 * prefers-color-scheme). palette.css does the rest. The reader's choice is
 * kept beside the other tweaks (TweaksPanel, localStorage `resonance-tweaks`)
 * and set before the first paint by APPEARANCE_SCRIPT, so a saved theme never
 * flashes the default first.
 */
import { encode, srgbHex, toLinearSrgb, type Oklch } from './oklch';
import { ACCENTS, DEFAULT_ACCENT, SCHEMES, paletteFor, type Accent, type Scheme } from './palette';

export const SCHEME_CHOICES = ['system', 'light', 'dark'] as const;
export type SchemeChoice = (typeof SCHEME_CHOICES)[number];

/** Where TweaksPanel keeps every tweak (the appearance among them). */
export const TWEAKS_KEY = 'resonance-tweaks';

export const isAccent = (v: unknown): v is Accent => typeof v === 'string' && (ACCENTS as readonly string[]).includes(v);
export const isSchemeChoice = (v: unknown): v is SchemeChoice => typeof v === 'string' && (SCHEME_CHOICES as readonly string[]).includes(v);

/** The browser's bars: each theme's paper in each scheme, in hex (what every browser's meta tag reads). */
export const THEME_COLORS: Record<Accent, Record<Scheme, string>> = Object.fromEntries(
  ACCENTS.map((a) => [a, Object.fromEntries(SCHEMES.map((s) => [s, srgbHex(paletteFor(a, s)['color-cream'])]))]),
) as Record<Accent, Record<Scheme, string>>;

/** A translucent colour laid over an opaque one, as the browser composites them (in encoded sRGB), in hex. */
function over(top: Oklch, bottom: Oklch): string {
  const b = toLinearSrgb(bottom).map(encode);
  const t = toLinearSrgb({ ...top, alpha: 1 }).map(encode);
  return `#${b.map((v, i) => Math.round((v * (1 - top.alpha) + t[i] * top.alpha) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The bars' colour while a dialog dims the page: the scrim (`--scrim`, the
 * modal's backdrop) over each theme's paper in each scheme — so the browser's
 * own bars dim with the page and no bright band is left at the top.
 */
export const DIMMED_THEME_COLORS: Record<Accent, Record<Scheme, string>> = Object.fromEntries(
  ACCENTS.map((a) => [a, Object.fromEntries(SCHEMES.map((s) => [s, over(paletteFor(a, s).scrim, paletteFor(a, s)['color-cream'])]))]),
) as Record<Accent, Record<Scheme, string>>;

/** The scheme a theme-color meta stands for now: the reader's, else its own media query's. */
export function metaScheme(meta: HTMLMetaElement, doc: Document = document): Scheme {
  const chosen = doc.documentElement.getAttribute('data-scheme');
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return /dark/.test(meta.media) ? 'dark' : 'light';
}

/** The theme-color metas the layout renders, one per scheme (Next's viewport.themeColor). */
export const THEME_COLOR_METAS = SCHEMES.map((s) => ({ media: `(prefers-color-scheme: ${s})`, color: THEME_COLORS[DEFAULT_ACCENT][s] }));

/** Points the page's theme-color metas at the theme's paper: the chosen scheme's on both, or each its own. */
export function syncThemeColor(accent: Accent, scheme: SchemeChoice, doc: Document = document): void {
  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const s: Scheme = scheme !== 'system' ? scheme : /dark/.test(m.media) ? 'dark' : 'light';
    m.content = THEME_COLORS[accent][s];
  });
}

/** Puts a choice on `<html>` (and the browser's bars). */
export function applyAppearance(accent: Accent, scheme: SchemeChoice, doc: Document = document): void {
  const root = doc.documentElement;
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  if (scheme === 'system') root.removeAttribute('data-scheme');
  else root.setAttribute('data-scheme', scheme);
  syncThemeColor(accent, scheme, doc);
}

/** The scheme the page shows now: the reader's, else the system's. */
export function resolvedScheme(doc: Document = document): Scheme {
  const chosen = doc.documentElement.getAttribute('data-scheme');
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme the page wears now. */
export function resolvedAccent(doc: Document = document): Accent {
  const a = doc.documentElement.getAttribute('data-accent');
  return isAccent(a) ? a : DEFAULT_ACCENT;
}

/**
 * Run in `<head>` before anything paints: the saved theme and scheme onto
 * `<html>`, and the bars' colour once the metas exist. Nothing here may throw
 * (blocked storage, a bad value): the page then simply wears the defaults.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(TWEAKS_KEY)})||'{}')||{},d=document.documentElement,a=${JSON.stringify(ACCENTS)}.indexOf(t.accentColor)>0?t.accentColor:null,s=t.scheme==='light'||t.scheme==='dark'?t.scheme:null;if(a)d.setAttribute('data-accent',a);if(s)d.setAttribute('data-scheme',s);if(!a&&!s)return;var c=${JSON.stringify(THEME_COLORS)}[a||${JSON.stringify(DEFAULT_ACCENT)}],f=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].content=c[s||(/dark/.test(m[i].media)?'dark':'light')]};f();document.addEventListener('DOMContentLoaded',f)}catch(e){}})();`;

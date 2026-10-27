/**
 * The landing stage on the real page: the DOM env the engine is told (measure.ts's places, the view below the fixed
 * header, the page's scheme and motion preference followed live, a clock on animation frames and timers) and the
 * stage built over it — again whenever the page's width changes (a rotated tablet, a resized window: the preset may
 * change, and every place moves), its places swapped quietly when only something else moved (fonts, late content).
 *
 *   const handle = mountLandingStage(window, layer, { createStage, cast });   …   handle.destroy();
 *
 * Nothing here reads layout per frame: the engine asks viewport(), ledges() and content() 24 times a second, and they
 * answer from what the last measure and the last scroll left.
 */
import { resolvedScheme } from '@/lib/design/appearance';
import type { CastEntry, Ledge, Rect, StageApi, StageClock, StageEnv, StageEvent, StageOptions, Theme } from '../types';
import { measureLanding, type LandingLayout } from './measure';
import { presetIn, presetQueries, type LandingPreset } from './presets';

export interface LandingStageDeps {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  onEvent?: (e: StageEvent) => void;
  seed?: number;
  /** Ms a burst of changes is waited out before measuring again. */
  settle?: number;
}

export interface LandingStageHandle {
  readonly stage: StageApi | null;
  readonly preset: LandingPreset;
  readonly layout: LandingLayout;
  readonly env: StageEnv | null;
  /** Measures again now (and rebuilds the stage if a visitor's place moved). */
  measure(): void;
  destroy(): void;
}

/**
 * Px of the page under the fixed header's box that the view leaves out as well: the engine places a character 10 px
 * inside the view, and a climb onto a card or a hop rises some 20 px above where it was placed — never into the bar
 * (a meeting's touch of mittens reached 3 px into its box at 12).
 */
export const HEADER_CLEAR = 16;

/** The engine's clock, on this window's animation frames and timers. */
export function windowClock(win: Window): StageClock {
  return {
    now: () => win.performance.now(),
    raf: fn => win.requestAnimationFrame(fn),
    caf: id => win.cancelAnimationFrame(id),
    timers: { set: (fn, ms) => win.setTimeout(fn, ms), clear: id => win.clearTimeout(id) },
  };
}

/** A ledge's place, to the pixel: two measures that agree put a visitor in the same spot. */
function where(l: Ledge): string {
  const r = (v: number) => Math.round(v);
  const pts = 'points' in l ? l.points.map(p => `${r(p[0])},${r(p[1])}`).join(' ') : '';
  const c = 'cover' in l && l.cover ? `${r(l.cover.x)},${r(l.cover.y)},${r(l.cover.w)},${r(l.cover.h)}` : '';
  const at = l.kind === 'spot' ? `${r(l.x)},${r(l.y)}` : l.kind === 'peek' ? `${r(l.ground ?? 0)},${r(l.x ?? 0)}` : '';
  return `${l.kind}|${pts}|${c}|${at}`;
}

/**
 * The stage over the landing page, measured now and kept up to date until `destroy()`. Throws (leaving nothing
 * behind) if the page can't be measured or the stage can't start; a later failure — a measure, a frame again and
 * again — ends it quietly: it is decoration, and the page goes on without it.
 */
export function mountLandingStage(window: Window, layer: HTMLElement, deps: LandingStageDeps): LandingStageHandle {
  const win = window as Window & typeof globalThis;
  const doc = layer.ownerDocument;
  const settle = deps.settle ?? 150;
  let preset = presetIn(win);
  let layout = measureLanding(doc, layer, preset);
  let body = bodySize();
  let stage: StageApi | null = null;
  let env: StageEnv | null = null;
  let destroyed = false;
  let timer = 0;
  let width = layout.width;
  let scroll = { x: win.scrollX, y: win.scrollY };
  let height = win.innerHeight;
  let vp: Rect = view();

  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = resolvedScheme(doc);
  let reduced = motionQuery.matches;

  /** The body's box, as its ResizeObserver reports it (border box). */
  function bodySize(): { w: number; h: number } {
    const r = doc.body.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  function view(): Rect {
    const top = layout.header + HEADER_CLEAR;
    return { x: scroll.x - layout.origin.x, y: scroll.y - layout.origin.y + top, w: layout.width, h: Math.max(0, height - top) };
  }
  function size(): void {
    layer.style.height = `${layout.height}px`;
  }

  function build(): void {
    if (stage) stage.destroy();
    stage = null;
    size();
    vp = view();
    env = {
      layer,
      ledges: () => layout.ledges,
      content: () => layout.content,
      viewport: () => vp,
      unitHeight: preset.unitHeight,
      theme,
      reducedMotion: reduced,
      clock: windowClock(win),
      document: doc,
    };
    stage = deps.createStage(env, deps.cast, { ...preset.options, seed: deps.seed, onEvent: deps.onEvent });
  }

  /** Measures again; a visitor whose place moved (or went) means a new stage, else the new places are simply used. */
  function remeasure(): void {
    timer = 0;
    if (destroyed) return;
    try {
      measureNow();
    } catch (e) {
      fail(e);
    }
  }
  function measureNow(): void {
    const next = presetIn(win);
    const was = layout;
    layout = measureLanding(doc, layer, next);
    body = bodySize();
    width = layout.width;
    vp = view();
    if (next !== preset || !stage) {
      preset = next;
      build();
      return;
    }
    const before = new Map(was.ledges.map(l => [l.id, where(l)]));
    const after = new Map(layout.ledges.map(l => [l.id, where(l)]));
    const moved = stage.visitors().some(v => v.ledge != null && before.get(v.ledge) !== after.get(v.ledge));
    size();
    if (moved) build();
  }
  function soon(): void {
    if (destroyed) return;
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(remeasure, settle);
  }
  /** Something failed past the start: said once, and the stage ends (its listeners with it) rather than fail again. */
  function fail(e: unknown): void {
    console.error('[landing stage] stopped', e);
    destroy();
  }

  const onScroll = () => {
    scroll = { x: win.scrollX, y: win.scrollY };
    vp = view();
  };
  // a phone's toolbars come and go as it scrolls (the height alone changes): only the view follows. A new width moves
  // every place: the visitors go at once and a new stage comes once the resizing is over
  const onResize = () => {
    height = win.innerHeight;
    scroll = { x: win.scrollX, y: win.scrollY };
    const w = doc.documentElement.clientWidth || win.innerWidth;
    if (w !== width) {
      width = w;
      if (stage) stage.destroy();
      stage = null;
      soon();
    }
    vp = view();
  };
  const onTheme = () => {
    const t = resolvedScheme(doc);
    if (t === theme) return;
    theme = t;
    if (stage) stage.setTheme(t);
  };
  const onMotion = () => {
    reduced = motionQuery.matches;
    if (stage) stage.setReducedMotion(reduced);
  };
  const onPreset = () => {
    if (presetIn(win) !== preset) onResize();
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onResize);
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  const presetMqs = presetQueries(win);
  for (const q of presetMqs) q.addEventListener('change', onPreset);
  const schemeWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(onTheme) : null;
  schemeWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });
  // the page grows or shrinks (pictures, the feed's columns settling): measure again — not for the observer's first
  // report, nor any that says what the last measure saw
  const onBody = (entries: ResizeObserverEntry[]) => {
    const e = entries[entries.length - 1];
    if (!e) return;
    const box = e.borderBoxSize?.[0];
    const w = box ? box.inlineSize : e.contentRect.width;
    const h = box ? box.blockSize : e.contentRect.height;
    if (Math.abs(w - body.w) < 0.5 && Math.abs(h - body.h) < 0.5) return;
    body = { w, h };
    soon();
  };
  const pageWatch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(onBody) : null;
  pageWatch?.observe(doc.body);
  // fonts still coming in move the words: measure again once they are (fonts already in were measured with)
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && fonts.status === 'loading') fonts.ready.then(soon, () => {});
  fonts?.addEventListener?.('loadingdone', soon);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (timer) win.clearTimeout(timer);
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('resize', onResize);
    darkQuery.removeEventListener('change', onTheme);
    motionQuery.removeEventListener('change', onMotion);
    for (const q of presetMqs) q.removeEventListener('change', onPreset);
    schemeWatch?.disconnect();
    pageWatch?.disconnect();
    fonts?.removeEventListener?.('loadingdone', soon);
    const s = stage;
    stage = null;
    s?.destroy();
    layer.style.removeProperty('height');   // an empty layer as high as the page would still be there to scroll
  }

  try {
    build();
  } catch (e) {
    destroy();
    throw e;
  }

  return {
    get stage() {
      return stage;
    },
    get preset() {
      return preset;
    },
    get layout() {
      return layout;
    },
    get env() {
      return env;
    },
    measure: remeasure,
    destroy,
  };
}

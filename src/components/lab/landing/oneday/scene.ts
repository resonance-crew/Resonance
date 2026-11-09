/**
 * One Day's little stages (the Paper Pals page's mountPalStrip / mountTitleScene, generalised): a section's scene is
 * one or more stages over its own box, each with its own cast and places, the places worked out from the section's
 * own geometry — the floors, card tops and frames it draws and so knows — never from words. Each part gets a layer
 * of its own (two puppets that come at different moments are two stages: a visit clears its stage); a part's first
 * visit is asked for once the scene is in view, a moment apart, popping up or walking in where its still stood.
 *
 *   const h = mountScene(window, root, { createStage, cast, measure, parts });
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '@/lib/mascots/landing/stage';
import type { CastEntry, Ledge, Rect, StageApi, StageEnv, StageEvent, StageOptions, Theme, VisitRequest } from '@/lib/mascots/types';

/** What a scene measures of its own box (its px); each scene adds the rects its places need. */
export interface SceneGeom {
  width: number;
  height: number;
  /** Px for 摺摺's height here (the box's `--unit`). */
  unit: number;
}

export interface ScenePart<G extends SceneGeom> {
  id: string;
  /** Who may come to this part's stage (slugs). */
  cast: readonly string[];
  /** Its layer's box in the scene's px (the whole scene by default). */
  box?: (g: G) => Rect;
  /** Its places, in its layer's px; `first` until its first visitor has come. */
  ledges: (g: G, first: boolean) => Ledge[];
  /** The first visit, asked for once the scene is seen (none: the part waits to be cued). */
  first?: VisitRequest;
  /** Ms after the scene is seen. */
  delay?: number;
  pace?: Partial<StageOptions>;
  /** The page theme its puppets wear whatever the page's (the night band's: dark). */
  theme?: Theme;
  /** Fades its layer's ends (a walk in from a side goes into the paper rather than being cut). */
  fade?: 'left' | 'right' | 'both';
  onEvent?: (e: StageEvent) => void;
}

export interface SceneDeps<G extends SceneGeom> {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  measure: (root: HTMLElement) => G | null;
  parts: readonly ScenePart<G>[];
  /** One came on stage for the first time: its still can go. */
  onEnter?: (slug: string) => void;
  /** How much of the scene must show before the first visits are asked for. */
  threshold?: number;
}

export interface SceneHandle<G extends SceneGeom> {
  stage(id: string): StageApi | null;
  geom(): G | null;
  /** The places were changed (a cue): each part reads its ledges again. */
  relayout(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

/** Px the engine keeps a body inside the view's foot (10), and 2 more: the floor a scene's puppets stand on. */
export const FLOOR_PAD = 12;

/** Px for 摺摺's height on `el`: its CSS's `--unit`, resolved (a custom property reads back as written). */
export function unitOf(win: Window, el: HTMLElement): number {
  const probe = win.document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;width:var(--unit)';
  el.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px > 0 ? px : parseFloat(win.getComputedStyle(el).getPropertyValue('--unit')) || 100;
}

const FADES = {
  left: 'linear-gradient(to right, transparent, #000 9%)',
  right: 'linear-gradient(to left, transparent, #000 9%)',
  both: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
} as const;

interface Live<G extends SceneGeom> {
  part: ScenePart<G>;
  layer: HTMLDivElement;
  stage: StageApi | null;
  ledges: Ledge[];
  first: boolean;
  box: Rect;
}

/**
 * The scene's stages over `root` (positioned), kept to its size until `destroy()`. Throws if it can't be measured or
 * a stage can't start: the caller leaves the stills as the server drew them.
 */
export function mountScene<G extends SceneGeom>(window: Window, root: HTMLElement, deps: SceneDeps<G>): SceneHandle<G> {
  const win = window as Window & typeof globalThis;
  const doc = win.document;
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = resolvedScheme(doc);
  let geom = deps.measure(root);
  if (!geom) throw new Error('scene: nothing to measure');
  let paused = false;
  let seen = typeof win.IntersectionObserver !== 'function';
  const timers: number[] = [];
  const entered = new Set<string>();

  const parts: Live<G>[] = deps.parts.map((part) => {
    const layer = doc.createElement('div');
    layer.className = 'oneday-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.part = part.id;
    root.appendChild(layer);
    return { part, layer, stage: null, ledges: [], first: true, box: { x: 0, y: 0, w: 0, h: 0 } };
  });

  function place(p: Live<G>): void {
    if (!geom) return;
    p.box = p.part.box ? p.part.box(geom) : { x: 0, y: 0, w: geom.width, h: geom.height };
    Object.assign(p.layer.style, {
      position: 'absolute', left: `${p.box.x}px`, top: `${p.box.y}px`, width: `${p.box.w}px`, height: `${p.box.h}px`,
      zIndex: '3', pointerEvents: 'none',
    });
    if (p.part.fade) {
      // colour-fixed: a mask's luminance
      p.layer.style.setProperty('mask-image', FADES[p.part.fade]);
      p.layer.style.setProperty('-webkit-mask-image', FADES[p.part.fade]);
    }
    p.ledges = p.part.ledges(geom, p.first);
  }
  function build(p: Live<G>): void {
    p.stage?.destroy();
    p.stage = null;
    if (!geom || p.box.w <= 0 || p.box.h <= 0) return;
    const cast = deps.cast.filter((c) => p.part.cast.includes(c.slug));
    const onEvent = (e: StageEvent) => {
      if (e.type === 'enter' && !entered.has(e.slug)) {
        entered.add(e.slug);
        deps.onEnter?.(e.slug);
      }
      if (e.type === 'enter' && p.first) {
        p.first = false;
        if (geom) p.ledges = p.part.ledges(geom, false);
      }
      p.part.onEvent?.(e);
    };
    const box = p.box;
    p.stage = deps.createStage(
      {
        layer: p.layer,
        ledges: () => p.ledges,
        viewport: () => ({ x: 0, y: 0, w: box.w, h: box.h }),
        unitHeight: geom.unit,
        theme: p.part.theme ?? theme,
        reducedMotion: motionQuery.matches,
        clock: windowClock(win),
      },
      cast,
      { ...p.part.pace, onEvent },
    );
    if (paused) p.stage.pause();
  }
  function begin(p: Live<G>, tries = 0): void {
    const req = p.part.first;
    if (!p.stage || !req || !p.first) return;
    if (!p.stage.visit(req) && tries < 12) timers.push(win.setTimeout(() => begin(p, tries + 1), 400));
  }
  function beginAll(): void {
    parts.forEach((p) => timers.push(win.setTimeout(() => begin(p), p.part.delay ?? 0)));
  }

  parts.forEach((p) => {
    place(p);
    build(p);
  });
  if (seen) beginAll();

  const sight = seen
    ? null
    : new win.IntersectionObserver((entries) => {
      if (seen || !entries.some((e) => e.isIntersecting)) return;
      seen = true;
      sight?.disconnect();
      beginAll();
    }, { threshold: deps.threshold ?? 0.35 });
  sight?.observe(root);

  let width = geom.width;
  let unit = geom.unit;
  const resized = () => {
    const next = deps.measure(root);
    if (!next) return;
    const rebuild = Math.round(next.width) !== Math.round(width) || next.unit !== unit;
    geom = next;
    width = next.width;
    unit = next.unit;
    for (const p of parts) {
      place(p);
      if (rebuild) {
        build(p);
        if (seen) begin(p);
      } else p.stage?.relayout();
    }
  };
  const watch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
  watch?.observe(root);
  const onTheme = () => {
    theme = resolvedScheme(doc);
    for (const p of parts) if (!p.part.theme) p.stage?.setTheme(theme);
  };
  const onMotion = () => {
    for (const p of parts) p.stage?.setReducedMotion(motionQuery.matches);
  };
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  const schemeWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(onTheme) : null;
  schemeWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });

  return {
    stage: (id) => parts.find((p) => p.part.id === id)?.stage ?? null,
    geom: () => geom,
    relayout() {
      if (!geom) return;
      for (const p of parts) p.ledges = p.part.ledges(geom, p.first);
    },
    pause() {
      paused = true;
      for (const p of parts) p.stage?.pause();
    },
    resume() {
      paused = false;
      for (const p of parts) p.stage?.resume();
    },
    destroy() {
      timers.forEach((t) => win.clearTimeout(t));
      sight?.disconnect();
      watch?.disconnect();
      schemeWatch?.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      motionQuery.removeEventListener('change', onMotion);
      for (const p of parts) {
        p.stage?.destroy();
        p.layer.remove();
      }
    },
  };
}

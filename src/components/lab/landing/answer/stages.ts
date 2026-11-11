/**
 * Prototype A's little stages: each section mounts its own, from the section's own geometry (a card top it drew, a
 * floor line, a wave) — never the landing's ledge-picker. Loaded only after idle (import('./stages')), so none of
 * this, nor the engine, is on the first paint.
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '@/lib/mascots/landing/stage';
import { flattenPath } from '@/lib/mascots/landing/svgPath';
import { sideOf, topOf } from '@/lib/mascots/reading/scene';
import type {
  CastEntry, Cover, Ledge, Point, Rect, StageApi, StageEnv, StageEvent, StageOptions, Theme,
} from '@/lib/mascots/types';

export type CreateStage = (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
export interface Engine {
  createStage: CreateStage;
  cast: readonly CastEntry[];
}

let engine: Promise<Engine> | null = null;
/** The engine and the cast, fetched once for every stage on the page. */
export function loadEngine(): Promise<Engine> {
  engine ??= Promise.all([import('@/lib/mascots'), import('@/lib/mascots/cast.generated')]).then(([m, c]) => ({
    createStage: m.createStage,
    cast: c.MASCOT_CAST,
  }));
  return engine;
}

/** Px for 摺摺's height on `el`: its CSS `--unit`, resolved (a custom property reads back as written). */
export function unitOf(win: Window, el: HTMLElement): number {
  const probe = win.document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;width:var(--unit)';
  el.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px > 0 ? px : 100;
}

/** A drawn path's points in `box`'s px (the page's transforms, a tilted card's too, included), about every `step` px. */
export function drawnPoints(path: SVGGeometryElement, box: DOMRect, step = 4): Point[] {
  let m: DOMMatrix | null = null;
  try {
    m = path.getScreenCTM();
  } catch {
    return [];
  }
  const d = path.getAttribute('d');
  if (!m || !d) return [];
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
  return (flattenPath(d, step / scale) ?? []).map(([x, y]) => [m.a * x + m.c * y + m.e - box.left, m.b * x + m.d * y + m.f - box.top]);
}

/** Something to be behind: an outline's own extent, its drawn top and sides, and its pen. */
export function coverOf(outline: readonly Point[], pen = 1.8, radius = 20): Cover {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const box: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { ...box, top: topOf(outline, box), radius, pen, sides: { left: sideOf(outline, box, 'left', radius), right: sideOf(outline, box, 'right', radius) } };
}

/** A stretch of a drawn top edge, x0..x1, a hair down onto the line (`sink`). */
export function stretch(top: readonly Point[], x0: number, x1: number, sink = 2): Point[] {
  const pts = top.filter(([x]) => x >= x0 && x <= x1).map(([x, y]): Point => [x, y + sink]);
  return pts;
}

/** The y of a polyline at x (flat past its ends). */
export function yAt(points: readonly Point[], x: number): number {
  if (!points.length) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Points moved by (dx, dy). */
export const shift = (pts: readonly Point[], dx: number, dy: number): Point[] => pts.map(([x, y]) => [x + dx, y + dy]);

export interface LayerStage {
  layer: HTMLDivElement;
  stage: StageApi;
  /** Where the layer lies in its root's px. */
  box: Rect;
  destroy(): void;
}

export interface LayerStageSpec {
  engine: Engine;
  /** Who may come to this stage. */
  slugs: readonly string[];
  /** The layer's box in the root's px (it clips its puppets). */
  box: Rect;
  unit: number;
  /** The places, in the layer's px. */
  ledges: () => Ledge[];
  /** What the engine counts as in view, in the layer's px (the whole layer by default). */
  viewport?: () => Rect;
  pace: Partial<StageOptions>;
  theme?: Theme;
  onEvent?: (e: StageEvent) => void;
  random?: () => number;
  /** A class for the layer (a mask, a nod). */
  className?: string;
}

/** A positioned layer in `root` and a stage on it. Throws if the stage can't start (the caller keeps its stills). */
export function layerStage(win: Window, root: HTMLElement, spec: LayerStageSpec): LayerStage {
  const doc = win.document;
  const layer = doc.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  if (spec.className) layer.className = spec.className;
  const b = spec.box;
  Object.assign(layer.style, {
    position: 'absolute', left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, zIndex: '4', pointerEvents: 'none',
  });
  root.appendChild(layer);
  try {
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    const stage = spec.engine.createStage(
      {
        layer,
        ledges: spec.ledges,
        viewport: spec.viewport ?? (() => ({ x: 0, y: 0, w: b.w, h: b.h })),
        unitHeight: spec.unit,
        theme: spec.theme ?? resolvedScheme(doc),
        reducedMotion: motion.matches,
        clock: windowClock(win),
        ...(spec.random ? { random: spec.random } : {}),
      },
      spec.engine.cast.filter((c) => spec.slugs.includes(c.slug)),
      { ...spec.pace, onEvent: spec.onEvent },
    );
    return {
      layer,
      stage,
      box: b,
      destroy() {
        stage.destroy();
        layer.remove();
      },
    };
  } catch (e) {
    layer.remove();
    throw e;
  }
}

/** A stage that keeps one character at its place a long while, and nobody else comes. */
export const STAY: Partial<StageOptions> = {
  first: [90, 90], // the first visit is asked for; this only backs it up
  gap: [2.5, 5],
  visit: [45, 80],
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
};

/** Where a still the server drew stands: its middle and its ground (less the shadow under it), in `box`'s px. */
export function stillGround(el: HTMLElement, box: DOMRect): { x: number; y: number } | null {
  const frame = (el.firstElementChild as HTMLElement | null) ?? el;
  const r = frame.getBoundingClientRect();
  if (!r.width) return null;
  const below = Number(el.dataset.below) || 0;
  return { x: r.left - box.left + r.width / 2, y: r.bottom - box.top - r.height * below };
}

/** Its resolved theme, or night whatever the scheme (a band drawn as night in either). */
export function themeOf(win: Window, el: HTMLElement): Theme {
  return el.closest('[data-night]') ? 'dark' : resolvedScheme(win.document);
}

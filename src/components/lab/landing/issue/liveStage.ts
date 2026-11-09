/**
 * The issue's little stages: each one over a box the section draws for it (the cover's empty cell, the sidenote's top
 * edge, the spread's foot rule, the last page's first rule), its places read from where the server drew the stills
 * (`[data-still]` inside the layer) — so the section's CSS is the one layout, at every width, as the Paper Pals
 * page's title scene does (lib/mascots/pals/titleScene). Loaded only once a stage is wanted (with the engine).
 *
 * Unlike the old LandingStage there is no picker roaming the page's words: a stage knows its few places and nothing
 * else. Never a place on a line of text; the puppets stand on cells, rules and edges this page draws for them.
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '@/lib/mascots/landing/stage';
import { unitOf } from '@/lib/mascots/pals/stage';
import type {
  CastEntry, Ledge, Point, Side, StageApi, StageEnv, StageEvent, StageOptions, Theme,
} from '@/lib/mascots/types';

export interface SpotDef {
  /** The ledge's id. */
  id: string;
  /** The still (`data-still`) whose ground and middle place this spot. */
  still: string;
  stance?: 'stand' | 'floor';
  enter?: 'pop' | 'walk';
  from?: Side;
  acts: readonly string[];
  meet?: boolean;
  prefer?: readonly string[];
  /** What pointing and writing aim at, in the layer's px (read again on every measure). */
  target?: (layer: DOMRect) => Point | undefined;
  /** Px nudged sideways from the still's middle. */
  dx?: number;
}

export interface LiveDeps {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  spots: readonly SpotDef[];
  /** A floor line across the layer at the first spot's ground (two can walk along it and meet). */
  floor?: { acts: readonly string[]; inset?: number };
  options: Partial<StageOptions>;
  /** The page theme these puppets wear whatever the page's (the night band). */
  theme?: Theme;
  /** The stage's dice (a scene that must come out one way leans on them for a moment; Math.random otherwise). */
  random?: () => number;
  onEvent?: (e: StageEvent) => void;
}

export interface LiveHandle {
  stage(): StageApi | null;
  /** Where a still's ground is now, in the layer's px. */
  ground(still: string): Point | null;
  relayout(): void;
  destroy(): void;
}

/** Each still's middle and ground (its foot less the shadow under the ground line), in the layer's px. */
export function stillGrounds(layer: HTMLElement): Map<string, Point> {
  const box = layer.getBoundingClientRect();
  const out = new Map<string, Point>();
  layer.querySelectorAll<HTMLElement>('[data-still]').forEach((el) => {
    const pic = (el.firstElementChild as HTMLElement | null) ?? el;
    const r = pic.getBoundingClientRect();
    if (r.width <= 0) return;
    const below = Number(el.dataset.below) || 0;
    out.set(el.dataset.still!, [r.left - box.left + r.width / 2, r.bottom - box.top - r.height * below]);
  });
  return out;
}

/**
 * A stage over `layer` (positioned; the stills inside it), kept to its size until `destroy()`. Throws if it can't
 * start (the caller leaves the stills as the server drew them).
 */
export function mountLive(window: Window, layer: HTMLElement, deps: LiveDeps): LiveHandle {
  const win = window as Window & typeof globalThis;
  const doc = win.document;
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = deps.theme ?? resolvedScheme(doc);
  let size = { w: 0, h: 0 };
  let grounds = new Map<string, Point>();
  let ledges: Ledge[] = [];
  let unit = 0;
  let stage: StageApi | null = null;

  function measure(): void {
    const r = layer.getBoundingClientRect();
    size = { w: r.width, h: r.height };
    grounds = stillGrounds(layer);
    const out: Ledge[] = [];
    let floorY: number | null = null;
    for (const s of deps.spots) {
      const g = grounds.get(s.still);
      if (!g) continue;
      const y = Math.round(g[1]);
      floorY ??= y;
      out.push({
        id: s.id,
        kind: 'spot',
        x: Math.round(g[0] + (s.dx ?? 0)),
        y,
        stance: s.stance ?? 'stand',
        ...(s.enter ? { enter: s.enter } : {}),
        ...(s.from ? { from: s.from } : {}),
        ...(s.meet ? { meet: true } : {}),
        ...(s.prefer ? { prefer: s.prefer } : {}),
        acts: s.acts,
        target: s.target?.(r),
      });
    }
    if (deps.floor && floorY != null) {
      const inset = deps.floor.inset ?? 6;
      out.unshift({ id: 'floor', kind: 'line', points: [[inset, floorY], [size.w - inset, floorY]], meet: true, acts: deps.floor.acts });
    }
    ledges = out;
  }
  function build(): void {
    stage?.destroy();
    stage = null;
    if (size.w <= 0 || size.h <= 0) return;
    unit = unitOf(win, layer);
    stage = deps.createStage(
      {
        layer,
        ledges: () => ledges,
        viewport: () => ({ x: 0, y: 0, w: size.w, h: size.h }),
        unitHeight: unit,
        theme,
        reducedMotion: motionQuery.matches,
        clock: windowClock(win),
        ...(deps.random ? { random: deps.random } : {}),
      },
      deps.cast,
      { ...deps.options, onEvent: devLog(win, layer, deps.onEvent) },
    );
  }
  measure();
  build();
  if (!stage) throw new Error('issue stage: nothing to stand on');

  let width = Math.round(size.w);
  const resized = () => {
    measure();
    if (Math.round(size.w) !== width || unitOf(win, layer) !== unit) {
      width = Math.round(size.w);
      build();
    } else stage?.relayout();
  };
  const watch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
  watch?.observe(layer);
  const onTheme = () => {
    if (deps.theme) return;
    theme = resolvedScheme(doc);
    stage?.setTheme(theme);
  };
  const onMotion = () => stage?.setReducedMotion(motionQuery.matches);
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);

  const handle: LiveHandle = {
    stage: () => stage,
    ground: (still) => grounds.get(still) ?? null,
    relayout: resized,
    destroy() {
      watch?.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      motionQuery.removeEventListener('change', onMotion);
      stage?.destroy();
      stage = null;
    },
  };
  if (process.env.NODE_ENV === 'development') {
    const w = win as Window & { __issueStages?: Record<string, unknown> };
    (w.__issueStages ??= {})[layerName(layer)] = { ...handle, ledges: () => ledges, unit: () => unit, size: () => size };
  }
  return handle;
}

function layerName(layer: HTMLElement): string {
  return layer.className.split(/\s+/)[0]?.replace(/^.*?_([A-Za-z]+)__.*$/, '$1') || 'layer';
}

/** Development builds keep each stage's latest events (window.__issueEvents) for probes; production passes it on. */
function devLog(win: Window, layer: HTMLElement, fn?: (e: StageEvent) => void): ((e: StageEvent) => void) | undefined {
  if (process.env.NODE_ENV !== 'development') return fn;
  const w = win as Window & { __issueEvents?: string[] };
  const name = layerName(layer);
  return (e) => {
    const list = (w.__issueEvents ??= []);
    list.push(`${name} ${e.type} ${e.slug}${'act' in e ? ` ${e.act}` : ''}${'ledge' in e ? ` @${e.ledge}` : ''} t=${e.t?.toFixed?.(1)}`);
    if (list.length > 300) list.shift();
    fn?.(e);
  };
}

/**
 * Dice that can be leaned on for a moment: while `low` is set every throw is under a half (the engine's coin flips
 * come out "the first one"), otherwise Math.random. The spread uses it so 牽牽 is the one who hands over the note.
 */
export function leaningDice(): { random: () => number; lean(v: number | null): void } {
  let held: number | null = null;
  return {
    random: () => (held != null ? held : Math.random()),
    lean: (v) => {
      held = v;
    },
  };
}

/**
 * The visitor's character element under a slug, for a nudge the stage's API has no word for: a pointer coming over it
 * (it waves, and its eyes follow) — the engine's own hover, nothing more.
 */
export function nudge(layer: HTMLElement, at: { x: number; y: number }, leave = false): boolean {
  const chars = Array.from(layer.querySelectorAll<HTMLElement>('.ms-char'));
  const el = chars[chars.length - 1];
  if (!el || typeof PointerEvent !== 'function') return false;
  const init = { pointerType: 'mouse', clientX: at.x, clientY: at.y, bubbles: false } as PointerEventInit;
  el.dispatchEvent(new PointerEvent('pointerenter', init));
  el.dispatchEvent(new PointerEvent('pointermove', init));
  if (leave) el.dispatchEvent(new PointerEvent('pointerleave', init));
  return true;
}

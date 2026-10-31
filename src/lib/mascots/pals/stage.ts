/**
 * The Paper Pals page's little stages: each profile's strip, where its one character lives — it pops up where its
 * still stood, does its signature move, wanders off and comes back — and the meeting strip at the foot of the page,
 * where the five come two at a time to meet and resonate. A stage of its own per strip, in the strip's own px, as
 * settings' strip is (reading/settingsStage.ts); the strip's CSS says its size (`--unit`, px for 摺摺's height), and
 * this reads it from there.
 *
 *   const handle = mountPalStrip(window, layer, { createStage, cast, kind: 'solo', slug: 'tuck', homeX: 0.3 });
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '../landing/stage';
import type { ActName, CastEntry, Ledge, StageApi, StageEnv, StageEvent, StageOptions, Theme } from '../types';
import type { PalSlug } from './still';

/** Px the engine keeps a body inside the view's foot (10), and 2 more: the floor a strip's puppets stand on. */
export const FLOOR_PAD = 12;

/** What each one does first when it comes to its strip: its signature, as its profile tells it. */
export const SIGNATURE: Record<PalSlug, readonly ActName[]> = {
  tuck: ['wave', 'reveal'],
  tag: ['wave', 'reveal'],
  card: ['deco', 'reveal'],
  dot: ['hop', 'wave'],
  night: ['twinkle', 'stretch'],
};

/** Standing at home: everything a stand allows that needs nothing to aim at. */
const HOME_ACTS = ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle', 'read'];
/** Out along the floor. */
const WALK_ACTS = ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle'];
/** Sitting on the floor in the strip's far corner (悄悄 naps there). */
const NOOK_ACTS = ['nap', 'look', 'wave', 'twinkle'];

/**
 * A profile's strip comes back to life soon after it empties, and stays a while: it is that character's own corner.
 * Nobody else comes, so nobody meets.
 */
export const SOLO_PACE: Partial<StageOptions> = {
  first: [40, 40],   // the first visit is asked for at once (mountPalStrip); this only backs it up
  gap: [1.4, 3.2],
  visit: [14, 22],
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
};

/** The meeting strip: nearly always two, nearly always meeting. */
export const MEET_PACE: Partial<StageOptions> = {
  first: [0.6, 1.2],
  gap: [1.2, 2.6],
  visit: [12, 17],
  pairChance: 0.85,
  meetChance: 0.9,
  meetEvery: 6,
  greetChance: 0.7,
  greetEvery: 8,
};

export type StripSpec = { kind: 'solo'; slug: PalSlug; homeX: number } | { kind: 'meet' };

/**
 * A strip's places, in its own px: its floor `FLOOR_PAD` above its foot; a solo strip's home (where its still stands,
 * `homeX` a fraction of the width), the same home popped up at (the first visit's, until `first` is false) and a nook
 * across from it; the meeting strip's two ends, across from each other.
 */
export function stripLedges(spec: StripSpec, width: number, height: number, unit: number, first = false): Ledge[] {
  const y = Math.round(height - FLOOR_PAD);
  const floor: Ledge = {
    id: 'floor', kind: 'line', points: [[6, y], [width - 6, y]], meet: spec.kind === 'meet', acts: WALK_ACTS,
  };
  if (spec.kind === 'meet') {
    const a = Math.round(width * 0.2);
    const b = Math.round(width * 0.8);
    return [
      floor,
      { id: 'end-l', kind: 'spot', x: a, y, from: 'left', stance: 'stand', meet: true, partner: 'end-r', acts: HOME_ACTS },
      { id: 'end-r', kind: 'spot', x: b, y, from: 'right', stance: 'stand', meet: true, partner: 'end-l', acts: HOME_ACTS },
    ];
  }
  const x = Math.round(Math.min(Math.max(width * spec.homeX, unit * 0.7), width - unit * 0.7));
  const left = x < width / 2;
  const nook = Math.round(left ? width - unit * 0.75 : unit * 0.75);
  const out: Ledge[] = [
    floor,
    { id: 'home', kind: 'spot', x, y, from: left ? 'left' : 'right', stance: 'stand', acts: HOME_ACTS, weight: 1.6 },
    { id: 'nook', kind: 'spot', x: nook, y, from: left ? 'right' : 'left', stance: 'floor', acts: NOOK_ACTS, weight: 0.7 },
  ];
  if (first) out.push({ id: 'home-pop', kind: 'spot', x, y, stance: 'stand', enter: 'pop', acts: HOME_ACTS });
  return out;
}

export interface PalStripDeps {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  spec: StripSpec;
  /** The page theme this strip's puppets wear whatever the page's (悄悄's band is night in either). */
  theme?: Theme;
  /** The first visitor has come on stage: the strip's still can go. */
  onFirstEnter?: () => void;
}

export interface PalStripHandle {
  stage(): StageApi | null;
  destroy(): void;
}

/**
 * Px for 摺摺's height on this strip or scene: its CSS's `--unit`, resolved — measured on a probe as wide as it,
 * since a custom property reads back as written (a `clamp(…)` stays a clamp).
 */
export function unitOf(win: Window, el: HTMLElement): number {
  const probe = win.document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;width:var(--unit)';
  el.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px > 0 ? px : parseFloat(win.getComputedStyle(el).getPropertyValue('--unit')) || 100;
}

/**
 * A strip's stage over `layer` (the strip's own box, positioned), kept to its size until `destroy()`. Once the strip
 * is mostly in view, a solo strip asks for its character, popped up at home doing its signature, and the meeting strip
 * has two meet. Throws if the stage can't start (the caller leaves the strip as the server drew it).
 */
export function mountPalStrip(window: Window, layer: HTMLElement, deps: PalStripDeps): PalStripHandle {
  const win = window as Window & typeof globalThis;
  const doc = win.document;
  const { spec } = deps;
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = deps.theme ?? resolvedScheme(doc);
  let size = { w: 0, h: 0 };
  let unit = 0;
  let first = spec.kind === 'solo';
  let entered = false;
  let ledges: Ledge[] = [];
  let stage: StageApi | null = null;
  let retry = 0;
  let seen = typeof win.IntersectionObserver !== 'function';

  const cast = spec.kind === 'solo' ? deps.cast.filter((c) => c.slug === spec.slug) : deps.cast;

  function measure(): void {
    const r = layer.getBoundingClientRect();
    size = { w: r.width, h: r.height };
    ledges = size.w > 0 ? stripLedges(spec, size.w, size.h, unitOf(win, layer), first) : [];
  }
  function onEvent(e: StageEvent): void {
    if (e.type !== 'enter' || entered) return;
    entered = true;
    first = false;
    measure();
    deps.onFirstEnter?.();
  }
  /** The first visit, asked for again for a moment if the strip isn't laid out yet. */
  function begin(tries = 0): void {
    if (!stage) return;
    const ok = spec.kind === 'solo'
      ? stage.visit({ ledge: 'home-pop', slug: spec.slug, acts: SIGNATURE[spec.slug] })
      : stage.canMeet() && stage.meet(Math.random() < 0.35 ? 'note' : 'none');
    if (!ok && tries < 12) retry = win.setTimeout(() => begin(tries + 1), 400);
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
        // the whole strip, its foot included: the engine keeps a body 10 px inside the view
        viewport: () => ({ x: 0, y: 0, w: size.w, h: size.h }),
        unitHeight: unit,
        theme,
        reducedMotion: motionQuery.matches,
        clock: windowClock(win),
      },
      cast,
      { ...(spec.kind === 'solo' ? SOLO_PACE : MEET_PACE), onEvent },
    );
    if (!entered && seen) begin();
  }
  measure();
  build();

  // The first visit waits until the strip is mostly in view: its still gives way to it right where the reader looks.
  const sight = seen ? null : new win.IntersectionObserver((entries) => {
    if (seen || !entries.some((e) => e.isIntersecting)) return;
    seen = true;
    sight?.disconnect();
    if (!entered) begin();
  }, { threshold: 0.6 });
  sight?.observe(layer);

  const resized = () => {
    measure();
    if (!stage || unitOf(win, layer) !== unit) build();
    else stage.relayout();
  };
  const watch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
  watch?.observe(layer);
  const onTheme = () => {
    if (deps.theme) return;
    theme = resolvedScheme(doc);
    stage?.setTheme(theme);
  };
  const onMotion = () => stage?.setReducedMotion(motionQuery.matches);
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  const schemeWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(onTheme) : null;
  schemeWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });

  return {
    stage: () => stage,
    destroy() {
      win.clearTimeout(retry);
      sight?.disconnect();
      watch?.disconnect();
      schemeWatch?.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      motionQuery.removeEventListener('change', onMotion);
      stage?.destroy();
      stage = null;
    },
  };
}

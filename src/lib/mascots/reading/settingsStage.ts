/**
 * Settings → 外觀's strip under the 小精靈 switch (round 20, the owner: a puppet there, so it is plain what the switch
 * is — 「讓它在下面走來走去」, with something to do when tapped): a small stage of its own, the strip's own px. Off, one
 * puppet naps on its floor and nobody else comes; on, they walk along it, meet, stand by the switch pointing at it.
 * Turning it on wakes the napper where it lay; turning it off sends everyone off and one comes back to nap.
 *
 * The web mounts it under its MascotsSwitch; the apps' island (native/mascots) runs the same scene and `settleStrip`.
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '../landing/stage';
import type { CastEntry, Ledge, Rect, StageApi, StageEnv, StageOptions, Theme } from '../types';
import { readingPresetFor, SETTINGS_ASLEEP, SETTINGS_AWAKE, settingsUnit } from './presets';
import { readingLedges } from './scene';

/**
 * Px the strip's stage reaches above the strip: a raised arm, a decoration, a pointing mitten may go there, never a
 * body (the view starts at the strip's top). The apps make their strip's web view this much taller, and say so with
 * `mascots.inset(STRIP_HEADROOM - 10, 0)` and a `floor` starting this far down.
 */
export const STRIP_HEADROOM = 24;

export interface SettingsStageDeps {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  /** The switch's box on screen (viewport px), what the one standing by it points at. */
  control: () => DOMRect | null;
  asleep: boolean;
}

export interface SettingsStageHandle {
  setAsleep(asleep: boolean): void;
  stage(): StageApi | null;
  destroy(): void;
}

/**
 * The strip went to sleep or woke (its ledges already the new ones): waking, the napper stands up where it lay and
 * stretches and waves before the others come; falling asleep, everyone goes and one comes to nap.
 */
export function settleStrip(stage: StageApi, asleep: boolean, options: Partial<StageOptions>): void {
  stage.setOptions(options);
  if (asleep) {
    stage.next();
    return;
  }
  const napper = stage.visitors()[0]?.slug;
  if (!napper || !stage.visit({ ledge: 'settings-wake', slug: napper, acts: ['stretch', 'wave'] })) stage.next();
}

/**
 * The strip's places as it is now, in its stage's px (the strip starts STRIP_HEADROOM down): its floor, the switch
 * over it, asleep or awake.
 */
export function stripLedges(width: number, height: number, control: Rect | null, asleep: boolean): Ledge[] {
  const unit = settingsUnit(width);
  return readingLedges(
    { width, height, settings: { floor: { x: 0, y: STRIP_HEADROOM, w: width, h: height - STRIP_HEADROOM }, control, asleep } },
    { ...readingPresetFor(width), unitHeight: unit },
  ).ledges;
}

export function mountSettingsStage(window: Window, layer: HTMLElement, deps: SettingsStageDeps): SettingsStageHandle {
  const win = window as Window & typeof globalThis;
  const doc = win.document;
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = resolvedScheme(doc);
  let reduced = motionQuery.matches;
  let asleep = deps.asleep;
  let size = { w: 0, h: 0 };
  let unit = 0;
  let ledges: Ledge[] = [];
  let stage: StageApi | null = null;

  function measure(): void {
    const r = layer.getBoundingClientRect();
    size = { w: r.width, h: r.height };
    const c = deps.control();
    const control = c ? { x: c.left - r.left, y: c.top - r.top, w: c.width, h: c.height } : null;
    ledges = size.w > 0 ? stripLedges(size.w, size.h, control, asleep) : [];
  }
  function build(): void {
    stage?.destroy();
    stage = null;
    if (size.w <= 0 || size.h <= 0) return;
    unit = settingsUnit(size.w);
    stage = deps.createStage(
      {
        layer,
        ledges: () => ledges,
        // the engine keeps a body 10 px inside the view's top: the view starts so that is the strip's own top
        viewport: () => ({ x: 0, y: STRIP_HEADROOM - 10, w: size.w, h: size.h - STRIP_HEADROOM + 10 }),
        unitHeight: unit,
        theme,
        reducedMotion: reduced,
        clock: windowClock(win),
      },
      deps.cast,
      asleep ? SETTINGS_ASLEEP : SETTINGS_AWAKE,
    );
  }
  measure();
  build();

  const resized = () => {
    measure();
    if (!stage || settingsUnit(size.w) !== unit) build();
    else stage.relayout();
  };
  const watch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
  watch?.observe(layer);
  const onTheme = () => {
    theme = resolvedScheme(doc);
    stage?.setTheme(theme);
  };
  const onMotion = () => {
    reduced = motionQuery.matches;
    stage?.setReducedMotion(reduced);
  };
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  const schemeWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(onTheme) : null;
  schemeWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });

  return {
    setAsleep(next) {
      if (next === asleep) return;
      asleep = next;
      measure();
      if (stage) settleStrip(stage, asleep, asleep ? SETTINGS_ASLEEP : SETTINGS_AWAKE);
    },
    stage: () => stage,
    destroy() {
      watch?.disconnect();
      schemeWatch?.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      motionQuery.removeEventListener('change', onMotion);
      stage?.destroy();
      stage = null;
    },
  };
}

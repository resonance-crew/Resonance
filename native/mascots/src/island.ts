/**
 * The apps' mascot island: the web's paper puppets (src/lib/mascots — the same engine, cast and reading-page places)
 * in a transparent WebView laid over the app's home feed or a card's page, which takes no touch. The app knows where
 * its views are and hands them over as a ReadingScene (src/lib/mascots/reading/scene.ts), in the overlay's own points;
 * the island turns that into places and runs the stage.
 *
 *   mascots.scene(scene, scrollY)   the views, as measured with the content scrolled to `scrollY` (call it on
 *                                   appear, when the content changes and when a scroll comes to rest)
 *   mascots.scroll(scrollY)         the content moved (once at a scroll's rest, or every frame): the puppets move with
 *                                   it; once that is drawn the island says `scrolled`
 *   mascots.tap(x, y)               a tap at an overlay point: true if a puppet was there (it reacts as to a click)
 *   mascots.inset(top, bottom)      points of the overlay under a bar at its top or foot (out of view)
 *   mascots.theme('light'|'dark') · mascots.reducedMotion(bool) · mascots.pause() · mascots.resume() · mascots.stop()
 *   mascots.visit({ ledge?, slug?, acts? }) · mascots.advance(sec) · mascots.ledges() · mascots.visitors()   (checks, debug)
 *
 * What the island tells the app (iOS `webkit.messageHandlers.mascots`, Android the `MascotsBridge.post(json)`
 * interface), each an object with a `type`:
 *
 *   { type: 'hits', rects: [[x, y, w, h], …] }   where a tap would reach a puppet, in overlay points: sent when they
 *                                                change (ten times a second at most), `[]` once nobody is there. The
 *                                                app keeps a tap inside one from the card under it and calls tap().
 *   { type: 'scrolled', y }                      a scroll(y) has been drawn (two frames on): an app that moved the web
 *                                                view natively during the scroll puts it back now.
 *
 * Places are kept in content points (a view's point plus the scroll at which it was measured), so the layer is simply
 * moved up by the scroll: a puppet sitting on a card rides along with it, and a new scene moves a visitor with its
 * place (or sends it off when its place went or moved sideways), as the web's stage does on a remeasure. A card's
 * places are named by its `key`, so the cards coming and going around it in a lazy list leave its visitor be.
 *
 * Settings' strip (round 20) is a scene with `settings`: a web view as big as the strip, its own sizes and pace, awake
 * (visitors along its floor, someone at the switch) or asleep (the switch off: one napping, nobody else coming).
 */
import { createStage } from '@/lib/mascots/engine';
import type { Ledge, Rect, StageApi, StageEnv, StageOptions, Theme } from '@/lib/mascots/types';
import { readingLedges, type ReadingScene } from '@/lib/mascots/reading/scene';
import { readingPresetFor, SETTINGS_ASLEEP, SETTINGS_AWAKE, settingsUnit } from '@/lib/mascots/reading/presets';
import { windowClock } from '@/lib/mascots/landing/stage';
import { settleStrip } from '@/lib/mascots/reading/settingsStage';
import { ISLAND_CAST } from './cast';

declare global {
  interface Window {
    mascots: typeof api;
    webkit?: { messageHandlers?: { mascots?: { postMessage(message: unknown): void } } };
    MascotsBridge?: { post(json: string): void };
  }
}

/** The stage's sizes and pace: a reading page's, by its width, or settings' strip awake or asleep. */
interface Setup {
  key: string;
  unitHeight: number;
  options: Partial<StageOptions>;
}

const layer = document.getElementById('stage') as HTMLDivElement;
let stage: StageApi | null = null;
let setup: Setup | null = null;
let ledges: Ledge[] = [];
let content: Rect[] = [];
let scrollY = 0;
let insetTop = 0;
let insetBottom = 0;
let theme: Theme = 'light';
let reduced = false;
let paused = false;
/** Settings' strip: asleep (the switch off) or awake, as last handed; null on a reading page. */
let asleep: boolean | null = null;

function view(): Rect {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: 0, y: scrollY + insetTop, w, h: Math.max(0, h - insetTop - insetBottom) };
}

/** Tells the app (iOS's message handler, Android's bridge); never throws. */
function post(message: { type: string } & Record<string, unknown>): void {
  try {
    window.webkit?.messageHandlers?.mascots?.postMessage(message);
  } catch {
    /* no handler */
  }
  try {
    window.MascotsBridge?.post(JSON.stringify(message));
  } catch {
    /* no bridge */
  }
}

/** A rect measured at `at` (the scroll then), in content points. */
const moved = (r: Rect | null | undefined, dy: number): Rect | null => (r ? { x: r.x, y: r.y + dy, w: r.w, h: r.h } : null);

function toContent(scene: ReadingScene, at: number): ReadingScene {
  const m = (r: Rect | null | undefined) => moved(r, at);
  return {
    ...scene,
    cards: scene.cards?.map((c) => ({
      ...c,
      box: m(c.box)!,
      top: c.top?.map(([x, y]) => [x, y + at] as const),
      outline: c.outline?.map(([x, y]) => [x, y + at] as const),
      foot: c.foot?.map((r) => m(r)!),
      words: c.words?.map((r) => m(r)!),
    })),
    column: m(scene.column),
    title: scene.title ? { firstLine: m(scene.title.firstLine) } : null,
    cover: m(scene.cover),
    paragraphs: scene.paragraphs?.map((r) => m(r)!),
    rail: m(scene.rail),
    respond: m(scene.respond),
    respondCeiling: scene.respondCeiling != null ? scene.respondCeiling + at : null,
    more: m(scene.more),
    end: m(scene.end),
    content: scene.content?.map((r) => m(r)!),
    settings: scene.settings ? { ...scene.settings, floor: m(scene.settings.floor)!, control: m(scene.settings.control) } : scene.settings,
  };
}

function setupFor(scene: ReadingScene): Setup {
  const width = scene.width || window.innerWidth;
  if (scene.settings) {
    // one size for the strip whether awake or not: waking or falling asleep is a change of pace, not a new stage
    return { key: `settings-${settingsUnit(width)}`, unitHeight: settingsUnit(width), options: scene.settings.asleep ? SETTINGS_ASLEEP : SETTINGS_AWAKE };
  }
  const preset = readingPresetFor(width);
  return { key: preset.name, unitHeight: preset.unitHeight, options: preset.options };
}

function place(): void {
  layer.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
}

function build(): void {
  stage?.destroy();
  stage = null;
  sentHits = '';
  if (!setup) return;
  const env: StageEnv = {
    layer,
    ledges: () => ledges,
    content: () => content,
    viewport: view,
    unitHeight: setup.unitHeight,
    theme,
    reducedMotion: reduced,
    clock: windowClock(window),
  };
  stage = createStage(env, ISLAND_CAST, { ...setup.options, observe: false });
  if (paused) stage.pause();
  watchHits();
}

/** Settings' strip turned asleep or awake (src/lib/mascots/reading/settingsStage.ts's rule, the web's). */
function wake(now: boolean, options: Partial<StageOptions>): void {
  if (stage) settleStrip(stage, !now, options);
}

// --- where a tap reaches someone, for the app ---------------------------------------------------------------------

let sentHits = '';
let hitsTimer = 0;

function hitsNow(): void {
  const rects = paused || !stage ? [] : stage.hits().map((r) => [r.x, r.y - scrollY, r.w, r.h].map((v) => Math.round(v)));
  const json = JSON.stringify(rects);
  if (json === sentHits) return;
  sentHits = json;
  post({ type: 'hits', rects });
}

/** Ten times a second while the stage runs (it says nothing when nothing changed). */
function watchHits(): void {
  window.clearInterval(hitsTimer);
  hitsTimer = 0;
  if (stage && !paused) hitsTimer = window.setInterval(hitsNow, 100);
  hitsNow();
}

let scrolledFrame = 0;

const api = {
  scene(scene: ReadingScene, at = scrollY): void {
    try {
      const next = setupFor(scene);
      const laid = readingLedges(toContent(scene, at), { ...readingPresetFor(scene.width || window.innerWidth), unitHeight: next.unitHeight });
      ledges = laid.ledges;
      content = laid.content;
      const was = asleep;
      asleep = scene.settings ? !!scene.settings.asleep : null;
      if (!setup || next.key !== setup.key || !stage) {
        setup = next;
        build();
      } else {
        setup = next;
        if (was != null && asleep != null && was !== asleep) wake(!asleep, next.options);
        else stage.relayout();
      }
    } catch (e) {
      console.error('[mascots] scene', e);
    }
  },
  scroll(y: number): void {
    scrollY = y;
    place();
    stage?.refresh();
    hitsNow();
    // drawn two frames on: the app may put its own offset back
    window.cancelAnimationFrame(scrolledFrame);
    scrolledFrame = window.requestAnimationFrame(() => {
      scrolledFrame = window.requestAnimationFrame(() => post({ type: 'scrolled', y }));
    });
  },
  tap(x: number, y: number): boolean {
    const hit = stage?.tap(x, y + scrollY) ?? false;
    if (hit) hitsNow();
    return hit;
  },
  inset(top: number, bottom = 0): void {
    insetTop = top;
    insetBottom = bottom;
  },
  theme(t: Theme): void {
    theme = t;
    stage?.setTheme(t);
  },
  reducedMotion(on: boolean): void {
    reduced = on;
    stage?.setReducedMotion(on);
  },
  pause(): void {
    paused = true;
    stage?.pause();
    watchHits();
  },
  resume(): void {
    paused = false;
    stage?.resume();
    watchHits();
  },
  stop(): void {
    stage?.destroy();
    stage = null;
    setup = null;
    watchHits();
  },
  visit(request: { ledge?: string; slug?: string; acts?: string[] } = {}): boolean {
    return stage?.visit(request) ?? false;
  },
  advance(sec: number): void {
    stage?.advance(sec);
    stage?.refresh();
    hitsNow();
  },
  ledges: (): string[] => ledges.map((l) => l.id),
  visitors: () => stage?.visitors() ?? [],
};

window.mascots = api;
place();

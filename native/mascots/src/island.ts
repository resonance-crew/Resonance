/**
 * The apps' mascot island: the web's paper puppets (src/lib/mascots — the same engine, cast and reading-page places)
 * in a transparent WebView laid over the app's home feed or a card's page, which takes no touch. The app knows where
 * its views are and hands them over as a ReadingScene (src/lib/mascots/reading/scene.ts), in the overlay's own points;
 * the island turns that into places and runs the stage.
 *
 *   mascots.scene(scene, scrollY)   the views, as measured with the content scrolled to `scrollY` (call it on
 *                                   appear, when the content changes and when a scroll comes to rest)
 *   mascots.scroll(scrollY)         the content moved (every frame of a scroll, or once at its end): the puppets move with it
 *   mascots.inset(top, bottom)      points of the overlay under a bar at its top or foot (out of view)
 *   mascots.theme('light'|'dark') · mascots.reducedMotion(bool) · mascots.pause() · mascots.resume() · mascots.stop()
 *   mascots.visit({ ledge?, slug? }) · mascots.advance(sec) · mascots.ledges() · mascots.visitors()   (checks, debug)
 *
 * Places are kept in content points (a view's point plus the scroll at which it was measured), so the layer is simply
 * moved up by the scroll: a puppet sitting on a card rides along with it, and a new scene moves a visitor with its
 * place (or sends it off when its place went or moved sideways), as the web's stage does on a remeasure.
 */
import { createStage } from '@/lib/mascots/engine';
import type { Ledge, Rect, StageApi, StageEnv, Theme } from '@/lib/mascots/types';
import { readingLedges, type ReadingScene } from '@/lib/mascots/reading/scene';
import { readingPresetFor, type ReadingPreset } from '@/lib/mascots/reading/presets';
import { windowClock } from '@/lib/mascots/landing/stage';
import { ISLAND_CAST } from './cast';

declare global {
  interface Window {
    mascots: typeof api;
  }
}

const layer = document.getElementById('stage') as HTMLDivElement;
let stage: StageApi | null = null;
let preset: ReadingPreset | null = null;
let ledges: Ledge[] = [];
let content: Rect[] = [];
let scrollY = 0;
let insetTop = 0;
let insetBottom = 0;
let theme: Theme = 'light';
let reduced = false;
let paused = false;

function view(): Rect {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: 0, y: scrollY + insetTop, w, h: Math.max(0, h - insetTop - insetBottom) };
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
  };
}

function place(): void {
  layer.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
}

function build(): void {
  stage?.destroy();
  stage = null;
  if (!preset) return;
  const env: StageEnv = {
    layer,
    ledges: () => ledges,
    content: () => content,
    viewport: view,
    unitHeight: preset.unitHeight,
    theme,
    reducedMotion: reduced,
    clock: windowClock(window),
  };
  stage = createStage(env, ISLAND_CAST, { ...preset.options, observe: false });
  if (paused) stage.pause();
}

const api = {
  scene(scene: ReadingScene, at = scrollY): void {
    try {
      const next = readingPresetFor(scene.width || window.innerWidth);
      const laid = readingLedges(toContent(scene, at), next);
      ledges = laid.ledges;
      content = laid.content;
      if (next !== preset || !stage) {
        preset = next;
        build();
      } else stage.relayout();
    } catch (e) {
      console.error('[mascots] scene', e);
    }
  },
  scroll(y: number): void {
    scrollY = y;
    place();
    stage?.refresh();
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
  },
  resume(): void {
    paused = false;
    stage?.resume();
  },
  stop(): void {
    stage?.destroy();
    stage = null;
    preset = null;
  },
  visit(request: { ledge?: string; slug?: string } = {}): boolean {
    return stage?.visit(request) ?? false;
  },
  advance(sec: number): void {
    stage?.advance(sec);
    stage?.refresh();
  },
  ledges: (): string[] => ledges.map((l) => l.id),
  visitors: () => stage?.visitors() ?? [],
};

window.mascots = api;
place();

/**
 * A page for the stage's tests, modelled on the desktop landing (1440 wide, the prototype's measured ledges thinned
 * out): the headline's two ends, the pill over it, the QR card and the badges beside it, the avatar row, the hero's
 * wave, the feed title and two story cards to sit on or peek past. Three real characters — 摺摺 (walks), 牽牽 (tall,
 * a back that hides its face) and 點點 (hops) — and a fake screen: a clock whose frames and wake-up timers the test
 * runs by hand.
 */
import raw from './stageFixture.json';
import { Stage } from './engine';
import { readManifest } from './rig';
import type { CastEntry, Ledge, Rect, StageApi, StageClock, StageEnv, StageEvent, StageOptions, Traits } from './types';

export const LEDGES: Ledge[] = [
  { id: 'hero-wave', kind: 'line', points: [[0, 969], [64, 975], [128, 977], [192, 966.7], [256, 973], [320, 979.7], [384, 961.3], [448, 964.3], [512, 978.3], [576, 978], [640, 977], [704, 975], [768, 970.3], [832, 963], [896, 968.7], [960, 968.3], [1024, 965], [1088, 962.7], [1152, 963], [1216, 972.3], [1280, 973], [1344, 972], [1408, 970], [1440, 969]], meet: true, acts: ['wave', 'look', 'stretch', 'hop', 'deco', 'reveal', 'twinkle'], zone: 'feed' },
  { id: 'headline-l', kind: 'edge', points: [[470, 312], [494, 312], [518, 312], [542, 312], [566, 314], [590, 313.9], [614, 313], [638, 313]], stance: 'stand', enter: 'pop', group: 'headline', weight: 0.5, partner: 'headline-r', clear: [{ x: 663, y: 264, w: 113, h: 23 }], acts: ['look', 'wave', 'stretch', 'deco'], zone: 'hero', meetChance: 0.7 },
  { id: 'headline-r', kind: 'edge', points: [[800, 313], [824, 313], [848, 313], [872, 313], [896, 313], [920, 313], [944, 313], [968, 313]], stance: 'stand', enter: 'pop', group: 'headline', weight: 0.5, partner: 'headline-l', clear: [{ x: 663, y: 264, w: 113, h: 23 }], acts: ['look', 'wave', 'stretch', 'deco'], zone: 'hero', meetChance: 0.7 },
  { id: 'pill-top', kind: 'edge', points: [[681, 264], [758, 264]], stance: 'stand', enter: 'pop', ceiling: 86, weight: 0.8, acts: ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal'], zone: 'hero' },
  { id: 'feed-title-l', kind: 'edge', points: [[564, 1153], [588, 1153], [612, 1153], [636, 1153.8], [648, 1153.6]], stance: 'stand', enter: 'pop', group: 'feed-title', partner: 'feed-title-r', acts: ['read', 'look', 'wave', 'stretch'], zone: 'feed' },
  { id: 'feed-title-r', kind: 'edge', points: [[792, 1153], [816, 1153], [840, 1153], [864, 1153], [876, 1153]], stance: 'stand', enter: 'pop', group: 'feed-title', partner: 'feed-title-l', acts: ['read', 'look', 'wave', 'stretch'], zone: 'feed' },
  { id: 'card-1-top', kind: 'edge', points: [[174, 1298], [198, 1297], [222, 1297], [246, 1298], [270, 1299], [294, 1299.7], [318, 1299.3], [342, 1298.3], [366, 1296.3], [390, 1295], [414, 1295], [438, 1296.3], [450, 1297.3]], stance: 'sit', cover: { x: 120, y: 1300, w: 384, h: 520, top: [[126, 1301.5], [150, 1298.7], [174, 1298], [198, 1297], [222, 1297], [246, 1298], [270, 1299], [294, 1299.7], [318, 1299.3], [342, 1298.3], [366, 1296.3], [390, 1295], [414, 1295], [438, 1296.3], [462, 1298], [486, 1300], [498, 1304]], radius: 18 }, acts: ['read', 'swing', 'look', 'wave', 'reveal'], zone: 'feed' },
  { id: 'card-5-top', kind: 'edge', points: [[990, 1299], [1014, 1299], [1038, 1299], [1062, 1299], [1086, 1299], [1110, 1299], [1134, 1298.7], [1158, 1298], [1182, 1298], [1206, 1298], [1230, 1298], [1254, 1298], [1266, 1298.7]], stance: 'sit', cover: { x: 936, y: 1300, w: 384, h: 520, top: [[942, 1303], [966, 1299], [990, 1299], [1014, 1299], [1038, 1299], [1062, 1299], [1086, 1299], [1110, 1299], [1134, 1298.7], [1158, 1298], [1182, 1298], [1206, 1298], [1230, 1298], [1254, 1298], [1278, 1299], [1302, 1300], [1314, 1304]], radius: 18 }, acts: ['read', 'swing', 'look', 'wave', 'reveal'], zone: 'feed' },
  { id: 'card-1-left', kind: 'peek', side: 'left', cover: { x: 120, y: 1300, w: 384, h: 520, radius: 18 }, ground: 1816, acts: ['look', 'wave', 'duck'], zone: 'feed' },
  { id: 'card-5-right', kind: 'peek', side: 'right', cover: { x: 936, y: 1300, w: 384, h: 520, radius: 18 }, ground: 1816, acts: ['look', 'wave', 'duck'], zone: 'feed' },
  { id: 'qr-left', kind: 'peek', side: 'left', cover: { x: 576, y: 517, w: 116, h: 120, radius: 16 }, ground: 635, target: [634, 577], acts: ['look', 'wave', 'duck'], zone: 'hero' },
  { id: 'qr-point', kind: 'spot', meet: true, partner: 'badges', x: 520, y: 636, from: 'left', clear: [{ x: 576, y: 517, w: 116, h: 120 }], ceiling: 484, target: [634, 577], acts: ['point', 'look', 'wave'], zone: 'hero', meetChance: 0.7 },
  { id: 'badges', kind: 'spot', meet: true, partner: 'qr-point', x: 924, y: 627, from: 'right', clear: [{ x: 714, y: 583, w: 148, h: 44 }], reach: true, ceiling: 484, target: [862, 585], acts: ['point', 'look', 'wave'], zone: 'hero', meetChance: 0.7 },
  { id: 'avatars-end', kind: 'spot', meet: true, x: 915, y: 737, from: 'right', clear: [{ x: 708, y: 713, w: 143, h: 19 }, { x: 714, y: 583, w: 148, h: 44 }], acts: ['wave', 'look', 'hop', 'deco', 'reveal'], zone: 'hero', meetChance: 0.7 },
];

/** The words and buttons: the headline and its paragraph, the badges, the avatar row, the pill, the QR card, the cards' bylines. */
export const CONTENT: Rect[] = [
  { x: 460, y: 306, w: 520, h: 82 }, { x: 460, y: 412, w: 520, h: 68 }, { x: 714, y: 525, w: 120, h: 44 }, { x: 714, y: 583, w: 148, h: 44 },
  { x: 714, y: 577, w: 148, h: 57 }, { x: 708, y: 713, w: 143, h: 19 }, { x: 590, y: 707, w: 102, h: 30 }, { x: 663, y: 264, w: 113, h: 23 },
  { x: 558, y: 1153, w: 324, h: 55 }, { x: 142, y: 1591, w: 340, h: 23 }, { x: 550, y: 1591, w: 340, h: 23 }, { x: 958, y: 1591, w: 340, h: 23 },
  { x: 576, y: 517, w: 116, h: 120 },
];

/** The first screen with the hero's wave in it, and the feed's two cards. */
export const HERO: Rect = { x: 0, y: 0, w: 1440, h: 1000 };
export const FEED: Rect = { x: 0, y: 1050, w: 1440, h: 900 };

const TRAITS: Record<string, Traits> = {
  tuck: { likes: ['read', 'reveal'] },
  tag: { pace: 1.1, likes: ['reveal', 'wave'] },
  dot: { likes: ['hop'], openStretch: true },
};

/** The three characters, their manifests read the way the site reads an imported manifest.json. */
export function fixtureCast(): CastEntry[] {
  return Object.entries(raw).map(([slug, m]) => ({
    slug, base: `/mascots/${slug}/`, manifest: readManifest(m), traits: TRAITS[slug],
  }));
}

/** A clock whose animation frames and timers run only when the test runs the screen. */
export function fakeScreen() {
  let now = 0;
  let id = 0;
  const frames = new Map<number, (now: number) => void>();
  const timers = new Map<number, { at: number; fn: () => void }>();
  const calls = { raf: 0, timers: 0 };
  const clock: StageClock = {
    now: () => now,
    raf: fn => {
      calls.raf++;
      frames.set(++id, fn);
      return id;
    },
    caf: i => {
      frames.delete(i);
    },
    timers: {
      set: (fn, ms) => {
        calls.timers++;
        timers.set(++id, { at: now + ms, fn });
        return id;
      },
      clear: i => {
        timers.delete(i);
      },
    },
  };
  /** A 60 Hz screen for `ms`: the timers that came due, then the frames asked for. */
  const run = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 1000 / 60;
      for (const [k, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(k);
          t.fn();
        }
      }
      const due = [...frames];
      frames.clear();
      for (const [, fn] of due) fn(now);
    }
  };
  return { clock, run, calls, pending: () => frames.size + timers.size };
}

export interface TestStage {
  stage: StageApi;
  /** The engine itself, for what the API doesn't show (where a mitten is, how tall a character stands). */
  engine: Stage;
  layer: HTMLDivElement;
  events: StageEvent[];
  /** Where the page is scrolled to, and its words and buttons: the stage reads them on every step. */
  view: Rect;
  content: Rect[];
  screen: ReturnType<typeof fakeScreen>;
  done(): void;
}

/** A stage over the fixture page (or `ledges`) in a jsdom layer, paused unless `autoplay` is asked for. */
export function mountStage(
  o: Partial<StageOptions> & { view?: Rect; reducedMotion?: boolean; cast?: CastEntry[]; ledges?: Ledge[] } = {},
): TestStage {
  const { view: first = HERO, reducedMotion = false, cast = fixtureCast(), ledges = LEDGES, ...options } = o;
  const layer = document.createElement('div');
  document.body.append(layer);
  const screen = fakeScreen();
  const events: StageEvent[] = [];
  let view = { ...first };
  let content = [...CONTENT];
  const env: StageEnv = {
    layer, ledges, content: () => content, unitHeight: 120, theme: 'light', reducedMotion,
    viewport: () => view, clock: screen.clock,
  };
  const engine = new Stage(env, cast, { autoplay: false, observe: false, onEvent: e => events.push(e), ...options });
  const stage = engine.api();
  return {
    stage, engine, layer, events, screen,
    get view() {
      return view;
    },
    set view(v) {
      view = v;
    },
    get content() {
      return content;
    },
    set content(c) {
      content = c;
    },
    done() {
      stage.destroy();
      layer.remove();
    },
  };
}

/**
 * Each scene's places, from what it drew (loaded with the stages, after the page is up): the floors, the card tops,
 * the frame. Puppets get ground, never words. And the answer scene's director, which cues its one stage beat by beat.
 */
import type { Cover, Ledge, Point, Rect, StageEvent, StageOptions } from '@/lib/mascots/types';
import { coverOf, floorOf, floorYAt, rectIn, seatOn } from './geom';
import { FLOOR_SEED } from './floor';
import { unitOf, type SceneGeom, type SceneHandle } from './scene';
import type { SceneConfig } from './useScene';

/** A part that lives at its place: comes once it is asked, stays a good while, goes, comes back; nobody else comes. */
const HOME_PACE: Partial<StageOptions> = {
  first: [600, 600],
  gap: [2.5, 5],
  visit: [28, 44],
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
};

const STAND_ACTS = ['look', 'wave', 'stretch', 'reveal', 'deco', 'read'];

/** A lane over a floor: from `up` units above the floor's middle down to the scene's foot (the floor in it). */
function laneBox(g: SceneGeom & { floor: Point[] }, up: number, x = 0, w = g.width): Rect {
  const mid = floorYAt(g.floor, x + w / 2);
  const top = Math.max(0, mid - g.unit * up);
  const bottom = Math.min(g.height, mid + Math.max(16, g.height - mid));
  return { x, y: top, w, h: bottom - top };
}

// --- morning ------------------------------------------------------------------------------------------------------

interface HeroGeom extends SceneGeom {
  floor: Point[];
  /** Where 摺摺 stands (its still's x), beside the story card. */
  tuckX: number;
  /** The answer card: 點點 peeks over its top from behind it. */
  b: Cover;
  dotX: number;
}

export function heroScene(): SceneConfig<HeroGeom> {
  const box = (g: HeroGeom) => laneBox(g, 2.4);
  const centreX = (root: HTMLElement, sel: string) => {
    const r = rectIn(root, root.querySelector(sel));
    return r ? r.x + r.w / 2 : null;
  };
  return {
    measure(root) {
      const r = root.getBoundingClientRect();
      const floor = floorOf(root, FLOOR_SEED.hero);
      const b = coverOf(root, root.querySelector('[data-paper="b"]'), 18);
      const tuckX = centreX(root, '[data-spot="tuck"] [data-still]');
      const dotX = centreX(root, '[data-spot="dot"] [data-still]');
      if (!floor || !b || tuckX == null || dotX == null) return null;
      return { width: r.width, height: r.height, unit: unitOf(window, root), floor: floor.pts, tuckX, b, dotX };
    },
    parts: [
      {
        // walks in from the scene's left edge along the floor to the story card's side, and waves first
        id: 'tuck',
        cast: ['tuck'],
        box,
        ledges: (g) => {
          const bx = box(g);
          return [{ id: 'home', kind: 'spot', x: g.tuckX, y: floorYAt(g.floor, g.tuckX) - bx.y, from: 'left', enter: 'walk', stance: 'stand', acts: STAND_ACTS,
            target: [g.b.x + g.b.w / 2, g.b.y + g.b.h / 2 - bx.y] }];
        },
        first: { ledge: 'home', slug: 'tuck', acts: ['wave', 'look', 'reveal'] },
        delay: 200,
        pace: HOME_PACE,
      },
      {
        // behind the answer: rises over its top, looks about, ducks, hops up again
        id: 'dot',
        cast: ['dot'],
        ledges: (g) => [{ id: 'home', kind: 'peek', side: 'top', cover: g.b, x: g.dotX, show: 0.62, acts: ['look', 'wave', 'duck', 'look', 'hop'] }],
        first: { ledge: 'home', slug: 'dot', acts: ['look', 'wave', 'duck', 'look'] },
        delay: 2300,
        pace: HOME_PACE,
      },
    ],
  };
}

// --- noon ---------------------------------------------------------------------------------------------------------

interface StoriesGeom extends SceneGeom {
  phone: boolean;
  seat: Cover;
  /** A phone's: the 紙芝居's frame, peeked over. */
  peek: Cover;
  /** A desktop's: the top shelf's end (點點 walks along the shelf to it). */
  end: Point;
  shelf: Rect;
}

const SEAT_ACTS = ['read', 'swing', 'read', 'look', 'reveal', 'deco'];
const PEEK_ACTS = ['look', 'wave', 'duck', 'point', 'look'];
const END_ACTS = ['look', 'hop', 'point', 'look', 'wave', 'hop'];

export function storiesScene(): SceneConfig<StoriesGeom> {
  return {
    // the section is tall (three shelves on a tablet): its first visits are asked for as soon as its top is in view,
    // so 聆聆 is climbing onto its card by the time the shelf itself scrolls up
    threshold: 0.04,
    measure(root) {
      const r = root.getBoundingClientRect();
      const phone = window.matchMedia('(max-width: 719px)').matches;
      const frame = coverOf(root, root.querySelector('[data-paper="frame"]'), 22);
      const seatEl = root.querySelector('[data-seat] [data-paper]');
      const seat = phone ? frame : coverOf(root, seatEl, 20);
      const endBox = rectIn(root, root.querySelector('[data-shelf-end]'));
      const shelf = rectIn(root, root.querySelector('ol'));
      const peek = phone ? frame : seat;
      if (!seat || !peek || !shelf || (!phone && !endBox)) return null;
      const end: Point = endBox ? [endBox.x + endBox.w / 2, endBox.y + endBox.h] : [0, 0];
      return { width: r.width, height: r.height, unit: unitOf(window, root), phone, seat, peek, end, shelf };
    },
    parts: [
      {
        id: 'card',
        cast: ['card'],
        ledges: (g) => {
          const x = g.phone ? g.seat.x + g.seat.w * 0.27 : g.seat.x + g.seat.w * 0.5;
          return [{ id: 'seat', kind: 'edge', points: seatOn(g.seat, x, g.unit * 0.5), stance: 'sit', cover: g.seat, acts: SEAT_ACTS, prefer: ['card'] }];
        },
        first: { ledge: 'seat', slug: 'card', acts: ['read'] },
        delay: 150,
        pace: HOME_PACE,
      },
      {
        id: 'dot',
        cast: ['dot'],
        ledges: (g) => {
          const target: Point = [g.shelf.x + g.shelf.w / 2, g.shelf.y + g.shelf.h * 0.3];
          return [
            g.phone
              ? { id: 'home', kind: 'peek', side: 'top', cover: g.peek, x: g.peek.x + g.peek.w * 0.8, show: 0.6, acts: PEEK_ACTS, target }
              : { id: 'home', kind: 'spot', x: g.end[0], y: g.end[1], from: 'right', enter: 'walk', stance: 'stand', acts: END_ACTS, target },
          ];
        },
        first: { ledge: 'home', slug: 'dot', acts: ['look', 'hop', 'point'] },
        delay: 1500,
        pace: HOME_PACE,
      },
    ],
  };
}

// --- dusk ---------------------------------------------------------------------------------------------------------

interface DuskGeom extends SceneGeom {
  floor: Point[];
  write: Rect;
  /** Where 牽牽 stands: between the words and the blank page (its still's x). */
  tagX: number;
}

export function duskScene(): SceneConfig<DuskGeom> {
  const box = (g: DuskGeom) => laneBox(g, 2.8);
  return {
    measure(root) {
      const r = root.getBoundingClientRect();
      const floor = floorOf(root, FLOOR_SEED.dusk);
      const write = rectIn(root, root.querySelector('[data-write]'));
      const spot = rectIn(root, root.querySelector('[data-spot="tag"] [data-still]'));
      if (!floor || !write || !spot) return null;
      return { width: r.width, height: r.height, unit: unitOf(window, root), floor: floor.pts, write, tagX: spot.x + spot.w / 2 };
    },
    parts: [
      {
        // walks in from the wings, stops facing the write button, points at it and beckons
        id: 'tag',
        cast: ['tag'],
        box,
        ledges: (g) => {
          const bx = box(g);
          // the button's near end (a phone's spans the width: aim up at it, not across at the page)
          const target: Point = [g.write.x + Math.min(g.write.w / 2, 60) - bx.x, g.write.y + g.write.h / 2 - bx.y];
          return [{ id: 'home', kind: 'spot', x: g.tagX, y: floorYAt(g.floor, g.tagX) - bx.y, from: 'left', enter: 'walk', stance: 'stand',
            acts: ['point', 'beckon', 'look', 'point', 'wave'], target }];
        },
        first: { ledge: 'home', slug: 'tag', acts: ['point', 'beckon', 'point'] },
        delay: 300,
        pace: { ...HOME_PACE, visit: [34, 50] },
      },
    ],
  };
}

// --- night --------------------------------------------------------------------------------------------------------

interface NightGeom extends SceneGeom {
  floor: Point[];
  hush: Rect;
}

export function nightScene(delay: number): SceneConfig<NightGeom> {
  const box = (g: NightGeom) => laneBox(g, 2.2);
  return {
    threshold: 0.5,
    measure(root) {
      const call = root.querySelector('[data-call]');
      if (!call) return null;
      const r = root.getBoundingClientRect();
      const floor = floorOf(root, FLOOR_SEED.call, '[data-callfloor]');
      const hush = rectIn(root, call.querySelector('[data-hush] [data-still]'));
      if (!floor || !hush) return null;
      return { width: r.width, height: r.height, unit: unitOf(window, call as HTMLElement), floor: floor.pts, hush };
    },
    parts: [
      {
        id: 'night',
        cast: ['night'],
        theme: 'dark',
        box,
        ledges: (g) => {
          const bx = box(g);
          const x = g.hush.x + g.hush.w / 2;
          return [{ id: 'home', kind: 'spot', x, y: floorYAt(g.floor, x) - bx.y, enter: 'pop', stance: 'stand',
            acts: ['twinkle', 'nap', 'look', 'twinkle', 'nap'], prefer: ['night'] }];
        },
        first: { ledge: 'home', slug: 'night', acts: ['twinkle', 'look', 'nap'] },
        delay,
        pace: { ...HOME_PACE, visit: [40, 60] },
      },
    ],
  };
}

// --- late afternoon: the answer ----------------------------------------------------------------------------------

interface AnswerGeom extends SceneGeom {
  floor: Point[];
  a: Cover;
  /** Card B where it ends (beat ③), its centre in beat ② (before it slides). */
  b: Rect;
  bWrite: Point;
}

/** The answer stage: one stage, its puppets cued, never coming on their own. */
const PLAY_PACE: Partial<StageOptions> = {
  first: [900, 900],
  gap: [900, 900],
  visit: [120, 160],
  dwell: 4,
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
  walkLimit: 3,
};

/**
 * Cues the answer stage: a beat that has stayed in view 400 ms sends whoever is on stage off, then directs its scene.
 * ① 聆聆 climbs onto the story and reads; ② it pops up by the blank card and writes; ③ 摺摺 and 聆聆 walk in from the two
 * wings and meet at the gutter (the note duet: wave, three waves, a note handed over, a bow), then 摺摺 comes back and
 * lifts its folded corner. Scrolling back cues the earlier beat again. Only the places of the beat being played
 * exist while it plays, so nobody turns up anywhere else.
 */
export class Director {
  private handle: SceneHandle<AnswerGeom> | null = null;
  private allowed = new Set<string>();
  private beat = 0;
  private token = 0;
  private timers: number[] = [];
  constructor(private readonly onWrite: (on: boolean) => void) {}

  may(id: string): boolean {
    return this.allowed.has(id);
  }
  attach(h: SceneHandle<AnswerGeom> | null, beat: number): void {
    this.handle = h;
    this.clear();
    if (h && beat) {
      this.beat = beat;
      this.later(() => this.cue(beat), 500);
    }
  }
  /** The beat being read now (0: none); cued once it has stayed 400 ms. */
  set(beat: number): void {
    if (beat === this.beat) return;
    this.beat = beat;
    this.clear();
    this.later(() => this.cue(beat), 400);
  }
  event(e: StageEvent): void {
    // the two have parted: 摺摺 comes back to the gutter and shows what is under its corner
    if (e.type === 'leave' && e.pair && this.beat === 3) {
      const t = this.token;
      this.whenEmpty(t, () => this.play('reveal', t), 0);
    }
  }
  private stage() {
    return this.handle?.stage('play') ?? null;
  }
  private clear(): void {
    this.timers.forEach((x) => window.clearTimeout(x));
    this.timers = [];
  }
  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }
  private allow(...ids: string[]): void {
    this.allowed = new Set(ids);
    this.handle?.relayout();
  }
  private cue(beat: number): void {
    const s = this.stage();
    if (!s) return;
    const t = ++this.token;
    this.allow();
    if (beat < 2) this.onWrite(false);
    if (s.visitors().length) s.next();
    this.whenEmpty(t, () => this.play(beat, t), 0);
  }
  private whenEmpty(t: number, fn: () => void, tries: number): void {
    const s = this.stage();
    if (!s || t !== this.token) return;
    if (!s.visitors().length || tries > 40) fn();
    else this.later(() => this.whenEmpty(t, fn, tries + 1), 120);
  }
  private play(what: number | 'reveal', t: number): void {
    const s = this.stage();
    if (!s || t !== this.token) return;
    if (what === 1) {
      this.allow('seat');
      s.visit({ ledge: 'seat', slug: 'card', acts: ['read', 'swing', 'read'] });
    } else if (what === 2) {
      this.allow('write');
      s.visit({ ledge: 'write', slug: 'card', acts: ['write', 'look', 'write'] });
      this.later(() => t === this.token && this.onWrite(true), 900);
    } else if (what === 3) {
      this.allow('meet');
      this.meet(t, 0);
    } else if (what === 'reveal') {
      this.allow('reveal');
      s.visit({ ledge: 'reveal', slug: 'tuck', acts: ['reveal', 'wave', 'look', 'reveal'] });
    }
  }
  /** Both walk in to meet; asked again while nobody came (a character's parts still loading). */
  private meet(t: number, n: number): void {
    const s = this.stage();
    if (!s || t !== this.token) return;
    if (!s.visitors().length) s.meet('note');
    this.later(() => {
      if (t === this.token && !s.visitors().length && n < 10) this.meet(t, n + 1);
    }, 700);
  }
}

export function answerScene(director: Director): SceneConfig<AnswerGeom> {
  return {
    threshold: 0.2,
    measure(root) {
      const stage = root;
      if (!stage.offsetParent) return null;
      const r = stage.getBoundingClientRect();
      const floor = floorOf(stage, FLOOR_SEED.stage, '[data-stage-floor]');
      const a = coverOf(stage, stage.querySelector('[data-paper="a"]'), 18);
      const bEl = stage.querySelector<HTMLElement>('[data-paper="b"]');
      if (!floor || !a || !bEl) return null;
      // card B's resting place (beat ③, its centre at 75 % of the stage: the CSS's) and its centre in beat ②
      const w = r.width;
      const cardW = bEl.offsetWidth;
      const cardH = bEl.offsetHeight;
      const top = a.y;
      const b: Rect = { x: w * 0.75 - cardW / 2, y: top, w: cardW, h: cardH };
      const bWrite: Point = [w * 0.75 + w * 0.06, top + cardH / 2];
      return { width: w, height: r.height, unit: unitOf(window, stage), floor: floor.pts, a, b, bWrite };
    },
    parts: [
      {
        id: 'play',
        cast: ['card', 'tuck'],
        // the stage's own box: its layer goes inside the set, so it rides the sticky stage
        box: (g) => ({ x: 0, y: 0, w: g.width, h: g.height }),
        ledges: (g) => {
          const out: Ledge[] = [];
          const mid = g.width / 2;
          if (director.may('seat')) {
            const x = g.a.x + g.a.w / 2;
            out.push({ id: 'seat', kind: 'edge', points: seatOn(g.a, x, g.unit * 0.45), stance: 'sit', cover: g.a, acts: ['read', 'swing', 'read', 'look'], prefer: ['card'] });
          }
          if (director.may('write')) {
            const x = mid + g.unit * 0.05;
            out.push({ id: 'write', kind: 'spot', x, y: floorYAt(g.floor, x), enter: 'pop', stance: 'stand', acts: ['write', 'look'], target: g.bWrite });
          }
          if (director.may('meet')) {
            out.push({ id: 'meet', kind: 'line', points: g.floor, meet: true, acts: ['look', 'wave'] });
          }
          if (director.may('reveal')) {
            out.push({ id: 'reveal', kind: 'spot', x: mid, y: floorYAt(g.floor, mid), enter: 'pop', stance: 'stand', acts: ['reveal', 'wave', 'look'] });
          }
          return out;
        },
        pace: PLAY_PACE,
        onEvent: (e) => director.event(e),
      },
    ],
  };
}

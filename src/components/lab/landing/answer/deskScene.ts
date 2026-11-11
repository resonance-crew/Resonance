/**
 * The desk's puppets (prototype A): 聆聆 sitting on the right end of the blank card's top, listening; 牽牽 standing at
 * its left end, by the thread's end. Each a stage of its own over the spread, placed where the server drew its still.
 *
 * On 回應 the page takes over (Desk.tsx): both stages are put away at once (`release`), their stills stand where they
 * were, and the hand-over is played with the stills — the two step toward each other, 聆聆 hands 牽牽 the folded note,
 * 牽牽 carries it along the thread — in the engine's 12 fps steps, so 牽牽 reaches the story within a few seconds. (The
 * engine's own duet always notices, waves and resonates before a note: twelve seconds or more, too long for a visitor
 * who has just pressed a button.) Then `settle` brings 聆聆 back to its seat, alive.
 */
import type { Ledge, Point, Rect, StageEvent } from '@/lib/mascots/types';
import { coverOf, drawnPoints, layerStage, STAY, stillGround, stretch, unitOf, type Engine, type LayerStage } from './stages';

export interface DeskGeometry {
  unit: number;
  /** The phone's layout: the story above the blank card. */
  stacked: boolean;
  answerBox: Rect;
  storyBox: Rect;
  /** The blank card's and the story's drawn top edges, x ascending (the spread's px). */
  answerTop: Point[];
  storyTop: Point[];
  /** Where the server drew each one standing (its middle, its ground). */
  card: { x: number; y: number } | null;
  tag: { x: number; y: number } | null;
  /** The gutter's thread, from the blank card to the story (none where it isn't drawn: the phone). */
  thread: Point[];
  /** The phone's margin thread, from the blank card's top up to the story's foot (none where it isn't drawn). */
  margin: Point[];
  /** The field's middle: what 聆聆 writes toward and 牽牽 beckons at. */
  field: Point;
}

export interface DeskSceneDeps {
  engine: Engine;
  /** One of the two came on stage: its still can go. */
  onEnter: (slug: 'card' | 'tag') => void;
  /** Classes for the layers: 聆聆's nods. */
  classes: { nod: string; nodOn: string };
  /** Already answered (the stage woke after a rest): only 聆聆 comes back; 牽牽 stays a still. */
  answered: boolean;
}

export interface DeskScene {
  geometry(): DeskGeometry | null;
  /** 回應: both stages go at once (their stills stand in their places; the page plays the hand-over with them). */
  release(): void;
  /** After the carry: 聆聆 back on its seat, alive (it pops up where its still stands). */
  settle(): void;
  /** Back to the blank card: 牽牽 pops up at its place again. */
  reset(): void;
  /** 聆聆 nods (someone is writing). */
  nod(): void;
  destroy(): void;
}

/** Sitting on the card: listening, writing down what it hears, the rest of its ways. */
const SEAT_ACTS = ['read', 'look', 'write', 'swing', 'deco'];
/** 牽牽 at the thread's end. */
const STAND_ACTS = ['look', 'wave', 'stretch'];

/** Units of air over the cards the layers reach up into (牽牽 is 1.25 units tall). */
const AIR = 1.8;

export function measureDesk(win: Window, root: HTMLElement): DeskGeometry | null {
  const box = root.getBoundingClientRect();
  const answerEl = root.querySelector<HTMLElement>('[data-desk-answer]');
  const storyEl = root.querySelector<HTMLElement>('[data-desk-story]');
  const aPath = answerEl?.querySelector<SVGGeometryElement>('path[data-outline]');
  const sPath = storyEl?.querySelector<SVGGeometryElement>('path[data-outline]');
  if (!answerEl || !storyEl || !aPath || !sPath || box.width <= 0) return null;
  const aOutline = drawnPoints(aPath, box);
  const sOutline = drawnPoints(sPath, box);
  if (aOutline.length < 8 || sOutline.length < 8) return null;
  const a = coverOf(aOutline);
  const s = coverOf(sOutline);
  const still = (slug: string) => {
    const el = root.querySelector<HTMLElement>(`[data-desk-still="${slug}"]`);
    return el ? stillGround(el, box) : null;
  };
  const threadEl = root.querySelector<SVGGeometryElement>('path[data-thread]');
  const threadShown = threadEl && (threadEl.closest('svg') as SVGSVGElement | null)?.getBoundingClientRect().width;
  const marginEl = root.querySelector<SVGGeometryElement>('path[data-margin-thread]');
  const marginShown = marginEl && (marginEl.closest('svg') as SVGSVGElement | null)?.getBoundingClientRect().height;
  const fieldEl = root.querySelector<HTMLElement>('[data-desk-field]');
  const f = fieldEl?.getBoundingClientRect();
  return {
    unit: unitOf(win, root),
    stacked: s.y + s.h < a.y + 4,
    answerBox: { x: a.x, y: a.y, w: a.w, h: a.h },
    storyBox: { x: s.x, y: s.y, w: s.w, h: s.h },
    answerTop: [...(a.top ?? [])],
    storyTop: [...(s.top ?? [])],
    card: still('card'),
    tag: still('tag'),
    thread: threadEl && threadShown ? drawnPoints(threadEl, box, 5) : [],
    margin: marginEl && marginShown ? drawnPoints(marginEl, box, 5) : [],
    field: f && f.width ? [f.left - box.left + f.width / 2, f.top - box.top + f.height / 2] : [a.x + a.w / 2, a.y + a.h / 2],
  };
}

export function mountDesk(win: Window, root: HTMLElement, deps: DeskSceneDeps): DeskScene {
  let g = measureDesk(win, root);
  if (!g) throw new Error('desk: nothing to measure');
  const { engine } = deps;
  let card: LayerStage | null = null;
  let tag: LayerStage | null = null;
  const firsts = new Set<string>();
  const timers: number[] = [];
  let width = Math.round(root.getBoundingClientRect().width);
  /** Answered: nobody is placed afresh on a new width until settle() or reset(). */
  let held = false;
  let gone = false;

  /** The solo layers: the blank card and the air over it, a little past its sides. */
  const soloBox = (geo: DeskGeometry): Rect => {
    const u = geo.unit;
    const air = u * AIR;
    return { x: geo.answerBox.x - u * 0.6, y: geo.answerBox.y - air, w: geo.answerBox.w + u * 1.2, h: geo.answerBox.h + air };
  };
  const toLayer = (pts: readonly Point[], b: Rect): Point[] => pts.map(([x, y]) => [x - b.x, y - b.y]);

  const onEvent = (slug: 'card' | 'tag') => (e: StageEvent) => {
    if (e.type === 'enter' && e.slug === slug) deps.onEnter(slug);
  };

  function mountCard(first: readonly string[], pop = false): void {
    card?.destroy();
    card = null;
    if (!g || !g.card || gone) return;
    const geo = g;
    const b = soloBox(geo);
    const u = geo.unit;
    const cover = coverOf(toLayer(answerOutline(), b));
    const at = geo.card!.x;
    const seatPoints = toLayer(stretch(geo.answerTop, at - u * 0.55, at + u * 0.55), b);
    const target = toLayer([geo.field], b)[0];
    const ledges = (): Ledge[] => {
      const seat: Ledge = { id: 'seat', kind: 'edge', points: seatPoints, stance: 'sit', cover, acts: SEAT_ACTS, prefer: ['card'], target };
      return [seat, { ...seat, id: 'seat-pop', enter: 'pop' }];
    };
    card = layerStage(win, root, {
      engine, slugs: ['card'], box: b, unit: u, ledges, pace: STAY, className: deps.classes.nod,
      onEvent: (e) => {
        if (e.type === 'enter') firsts.add('card');
        onEvent('card')(e);
      },
    });
    const ask = (tries = 0) => {
      if (!card || gone) return;
      const ok = card.stage.visit({ ledge: pop || !firsts.has('card') ? 'seat-pop' : 'seat', slug: 'card', acts: first });
      if (!ok && tries < 10) timers.push(win.setTimeout(() => ask(tries + 1), 300));
    };
    ask();
  }

  function mountTag(first: readonly string[]): void {
    tag?.destroy();
    tag = null;
    if (!g || !g.tag || gone) return;
    const geo = g;
    const b = soloBox(geo);
    const u = geo.unit;
    const at = geo.tag!.x;
    const points = toLayer(stretch(geo.answerTop, at - u * 0.4, at + u * 0.4), b);
    const target = toLayer([geo.field], b)[0];
    const ledges = (): Ledge[] => [{ id: 'stand', kind: 'edge', points, stance: 'stand', enter: 'pop', acts: STAND_ACTS, target }];
    tag = layerStage(win, root, { engine, slugs: ['tag'], box: b, unit: u, ledges, pace: STAY, onEvent: onEvent('tag') });
    const ask = (tries = 0) => {
      if (!tag || gone) return;
      const ok = tag.stage.visit({ ledge: 'stand', slug: 'tag', acts: first });
      if (!ok && tries < 10) timers.push(win.setTimeout(() => ask(tries + 1), 300));
    };
    ask();
  }

  /** The blank card's outline in the spread's px, read again (it changes with the card). */
  function answerOutline(): Point[] {
    const box = root.getBoundingClientRect();
    const p = root.querySelector<SVGGeometryElement>('[data-desk-answer] path[data-outline]');
    return p ? drawnPoints(p, box) : [];
  }

  function start(): void {
    if (deps.answered) {
      mountCard(['look', 'wave']);
      return;
    }
    mountCard(['look', 'write']);
    // 牽牽 a beat later: it looks round, waves, and beckons toward the empty line
    timers.push(win.setTimeout(() => mountTag(['look', 'wave', 'beckon']), 900));
  }
  start();

  const resized = () => {
    const next = measureDesk(win, root);
    if (!next) return;
    g = next;
    const w = Math.round(root.getBoundingClientRect().width);
    if (w !== width && !held) {
      width = w;
      // a new width: everyone is placed afresh where their stills now stand
      const hadTag = !!tag;
      mountCard([]);
      if (hadTag) mountTag([]);
    }
  };
  const W = win as Window & typeof globalThis;
  const watch = typeof W.ResizeObserver === 'function' ? new W.ResizeObserver(resized) : null;
  watch?.observe(root);

  return {
    geometry: () => g,
    release() {
      held = true;
      timers.forEach((t) => win.clearTimeout(t));
      timers.length = 0;
      card?.destroy();
      tag?.destroy();
      card = tag = null;
    },
    settle() {
      if (gone) return;
      held = false;
      mountCard(['wave', 'look'], true);
    },
    reset() {
      if (gone) return;
      held = false;
      if (!card) mountCard(['look'], true);
      mountTag(['look', 'wave']);
    },
    nod() {
      const el = card?.layer;
      if (!el) return;
      el.classList.remove(deps.classes.nodOn);
      void el.offsetWidth;
      el.classList.add(deps.classes.nodOn);
    },
    destroy() {
      gone = true;
      timers.forEach((t) => win.clearTimeout(t));
      watch?.disconnect();
      card?.destroy();
      tag?.destroy();
      card = tag = null;
    },
  };
}

/**
 * The Paper Pals page's opening (round 2, the owner: 「他們都沒有在做事情，他們好像在展示一樣」): the page's title on a
 * story card, and the five around it each busy with something of its own — 摺摺 sitting on the card's top reading,
 * 悄悄 dozing at the other end of it, 點點 peeking out from behind the card, 聆聆 and 牽牽 meeting on the floor beside
 * it. The engine keeps two to a stage, so each of these is a stage of its own (the meeting one stage for two), all
 * over the one scene; where each one is comes from where the server drew its still (`[data-still]`), so the page's
 * CSS is the one layout, at every width.
 *
 *   const handle = mountTitleScene(window, root, { createStage, cast, onEnter, onPoke });
 */
import { resolvedScheme } from '@/lib/design/appearance';
import { windowClock } from '../landing/stage';
import { flattenPath } from '../landing/svgPath';
import { sideOf, topOf } from '../reading/scene';
import type { CastEntry, Cover, Ledge, Point, Rect, StageApi, StageEnv, StageEvent, StageOptions, Theme, VisitRequest } from '../types';
import { unitOf } from './stage';
import type { PalSlug } from './still';

/** Where the server drew the five and the card, in the scene's own px (`x`: a still's middle, `y`: its ground). */
export interface TitleLayout {
  width: number;
  height: number;
  /** Px for 摺摺's height (the scene's `--unit`). */
  unit: number;
  card: Rect;
  /**
   * The card's drawn outline, points along it every few px, and the width of its pen: 點點 behind it is cut along
   * the line's outer edge (the whole line stays in front), and the sitters sit on its drawn top.
   */
  outline?: readonly Point[];
  pen?: number;
  stills: Partial<Record<PalSlug, { x: number; y: number }>>;
  /** The floor the two meet on: beside the card (wide) or under it (narrow). */
  floor: Rect;
}

export type TitlePart = 'tuck' | 'night' | 'dot' | 'meet';

/** Sitting on the card: reading, swinging its legs, the rest of its ways. */
const SEAT_ACTS = ['read', 'swing', 'reveal', 'look', 'wave', 'deco'];
/** 悄悄's end of the card: mostly asleep. */
const NAP_ACTS = ['nap', 'twinkle', 'look', 'swing'];
/** 點點 behind the card. */
const PEEK_ACTS = ['look', 'wave', 'duck', 'point', 'beckon'];
const FLOOR_ACTS = ['look', 'wave', 'hop', 'deco', 'reveal', 'stretch'];

/** A sitter stays a good while, goes, and comes back over the card's top; nobody else comes to its stage. */
export const TITLE_SOLO: Partial<StageOptions> = {
  first: [90, 90],   // the first visit is asked for (mountTitleScene); this only backs it up
  gap: [2, 4.5],
  visit: [40, 75],
  pairChance: 0,
  meetChance: 0,
  greetChance: 0,
};

/** The two on the floor: one there, the other walks up, they meet; then again, and again. */
export const TITLE_MEET: Partial<StageOptions> = {
  first: [90, 90],
  gap: [1.4, 3],
  visit: [16, 24],
  pairChance: 1,
  meetChance: 1,
  meetEvery: 3,
  greetChance: 0.5,
  greetEvery: 6,
};

/** What each part does first, and which of the cast it is. */
export const TITLE_PARTS: Record<TitlePart, { cast: readonly PalSlug[]; first: VisitRequest }> = {
  tuck: { cast: ['tuck'], first: { ledge: 'seat-pop', slug: 'tuck', acts: ['read', 'reveal'] } },
  night: { cast: ['night'], first: { ledge: 'seat-pop', slug: 'night', acts: ['nap'] } },
  dot: { cast: ['dot'], first: { ledge: 'peek', slug: 'dot', acts: ['look', 'wave'] } },
  meet: { cast: ['card', 'tag'], first: { ledge: 'host-pop', slug: 'card', acts: ['deco'], meet: true } },
};

/** The meeting's own layer is the floor's box: its places are in that box's px. */
export function partBox(part: TitlePart, l: TitleLayout): Rect {
  return part === 'meet' ? l.floor : { x: 0, y: 0, w: l.width, h: l.height };
}

/**
 * A part's places in its own layer's px (`first`: the pop-ups its first visit uses, there until it has come). A
 * sitter's seat is a short stretch of the card's top round where its still stands; 點點 peeks past the card's left
 * side when there is room for it there, over its top otherwise; the two meet on the floor, 聆聆 standing where its
 * still did.
 */
export function titleLedges(part: TitlePart, l: TitleLayout, first = false): Ledge[] {
  const u = l.unit;
  const cover = cardCover(l);
  if (part === 'tuck' || part === 'night') {
    const at = l.stills[part];
    if (!at) return [];
    // its stretch of the card's drawn top, a hair down onto the line
    const x0 = at.x - u * 0.55;
    const x1 = at.x + u * 0.55;
    const drawn = (cover.top ?? []).filter(([x]) => x >= x0 && x <= x1).map(([x, y]): [number, number] => [x, y + 2]);
    const flat = Math.round(l.card.y + 2);
    const points: [number, number][] = drawn.length >= 2 ? drawn : [[x0, flat], [x1, flat]];
    const acts = part === 'night' ? NAP_ACTS : SEAT_ACTS;
    const seat: Ledge = { id: 'seat', kind: 'edge', points, stance: 'sit', cover, acts, prefer: [part] };
    return first ? [seat, { id: 'seat-pop', kind: 'edge', points, stance: 'sit', enter: 'pop', cover, acts, prefer: [part] }] : [seat];
  }
  if (part === 'dot') {
    const at = l.stills.dot;
    const target: [number, number] = [l.card.x + l.card.w / 2, l.card.y + l.card.h * 0.35];
    const beside = at ? at.x < l.card.x : l.card.x > u * 0.9;
    return [
      beside
        ? { id: 'peek', kind: 'peek', side: 'left', cover, reveal: 0.62, acts: PEEK_ACTS, target }
        : { id: 'peek', kind: 'peek', side: 'top', cover, x: at?.x ?? l.card.x + l.card.w / 2, show: 0.62, acts: PEEK_ACTS, target },
    ];
  }
  const f = l.floor;
  const y = Math.round(f.h - 12);
  const host = l.stills.card;
  const hx = Math.round(host ? host.x - f.x : f.w * 0.35);
  const out: Ledge[] = [
    { id: 'floor', kind: 'line', points: [[6, y], [f.w - 6, y]], meet: true, acts: FLOOR_ACTS },
    { id: 'host', kind: 'spot', x: hx, y, stance: 'stand', meet: true, acts: FLOOR_ACTS, weight: 1.5 },
  ];
  if (first) out.push({ id: 'host-pop', kind: 'spot', x: hx, y, stance: 'stand', enter: 'pop', meet: true, acts: FLOOR_ACTS });
  return out;
}

/** The card as something to be behind: its drawn top and sides when its outline was read, else its rounded box. */
export function cardCover(l: TitleLayout): Cover {
  const o = l.outline;
  if (!o || o.length < 8) return { ...l.card, radius: 20 };
  // the outline's own extent: its wobble swings a little past the box it is laid out in
  const xs = o.map((p) => p[0]);
  const ys = o.map((p) => p[1]);
  const box: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return {
    ...box,
    top: topOf(o, box),
    radius: 20,
    pen: l.pen,
    sides: { left: sideOf(o, box, 'left', 20), right: sideOf(o, box, 'right', 20) },
  };
}

/** A path's points in `box`'s px, about every `step` px of the screen (none if it can't be read). */
function drawnPoints(path: SVGGeometryElement, box: DOMRect, step: number): Point[] {
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

/** The scene as the server laid it out, measured now (its px). */
export function measureTitle(win: Window, root: HTMLElement): TitleLayout | null {
  const box = root.getBoundingClientRect();
  const cardEl = root.querySelector('[data-pals-card]');
  const floorEl = root.querySelector('[data-pals-floor]');
  if (!cardEl || !floorEl || box.width <= 0) return null;
  const rel = (r: DOMRect): Rect => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
  const stills: TitleLayout['stills'] = {};
  root.querySelectorAll<HTMLElement>('[data-still]').forEach((el) => {
    // the drawing's own frame (its wrapper is cut at the ground already): its foot less the shadow under the ground
    const r = (el.firstElementChild ?? el).getBoundingClientRect();
    const below = Number(el.dataset.below) || 0;
    stills[el.dataset.still as PalSlug] = { x: r.left - box.left + r.width / 2, y: r.bottom - box.top - r.height * below };
  });
  // the card's own drawn outline (the stills are pictures: no stroked paths of theirs)
  const strokes = Array.from(cardEl.querySelectorAll<SVGGeometryElement>('path[stroke]')).filter(
    (p) => !['none', 'transparent'].includes(p.getAttribute('stroke') || 'none'),
  );
  const outline = strokes.flatMap((p) => drawnPoints(p, box, 4));
  const pen = strokes.length ? parseFloat(strokes[0].getAttribute('stroke-width') || '') || undefined : undefined;
  return {
    width: box.width,
    height: box.height,
    unit: unitOf(win, root),
    card: rel(cardEl.getBoundingClientRect()),
    outline: outline.length >= 8 ? outline : undefined,
    pen,
    stills,
    floor: rel(floorEl.getBoundingClientRect()),
  };
}

export interface TitleSceneDeps {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  /** One of the five came on stage for the first time: its still can go. */
  onEnter?: (slug: string) => void;
  /** One was tapped (or clicked): its body's box, in the scene's px. */
  onPoke?: (slug: string, body: Rect) => void;
}

export interface TitleSceneHandle {
  stages(): StageApi[];
  /** Where everyone on the scene is now (a box round each one's body, the scene's px), and the card. */
  bodies(): (Rect & { slug: string })[];
  card(): Rect | null;
  destroy(): void;
}

/** A box round a visitor's body from its ground point and height (they are about three quarters as wide as tall). */
function bodyOf(v: { x: number; y: number; h: number }, dx: number, dy: number): Rect {
  const w = v.h * 0.78;
  return { x: dx + v.x - w / 2, y: dy + v.y - v.h, w, h: v.h };
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where a tapped one's words go (`size`: the pill's): over its head, or beside it at its face's height, or over it
 * shifted aside — whichever is inside `bounds` and covers the least of `avoid` (the others, the card's words), in
 * that order of liking. The pill's top-left, in the same px.
 */
export function placeSaid(size: { w: number; h: number }, body: Rect, avoid: readonly Rect[], bounds: Rect, gap = 8): { x: number; y: number } {
  const cx = body.x + body.w / 2;
  const face = body.y + body.h * 0.32 - size.h / 2;
  const above = body.y - gap - size.h;
  const tries: { x: number; y: number }[] = [
    { x: cx - size.w / 2, y: above },
    { x: body.x + body.w + gap, y: face },
    { x: body.x - gap - size.w, y: face },
    { x: body.x + body.w * 0.2, y: above },
    { x: body.x + body.w * 0.8 - size.w, y: above },
  ];
  let best = tries[0];
  let bestCost = Infinity;
  tries.forEach((p, i) => {
    const box = { x: p.x, y: p.y, ...size };
    const out =
      Math.max(0, bounds.x - p.x) + Math.max(0, p.x + size.w - bounds.x - bounds.w) +
      Math.max(0, bounds.y - p.y) + Math.max(0, p.y + size.h - bounds.y - bounds.h);
    const covered = avoid.reduce((sum, r) => sum + overlap(box, r), 0);
    const cost = out * size.h * 4 + covered + i;
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  });
  // never off the scene's sides: slid back in if no place quite fits
  return {
    x: Math.min(bounds.x + bounds.w - size.w, Math.max(bounds.x, best.x)),
    y: Math.min(bounds.y + bounds.h - size.h, Math.max(bounds.y, best.y)),
  };
}

/**
 * The opening's stages over `root` (the scene's box, positioned), one layer each, kept to the scene's size until
 * `destroy()`. Each part's first visit is asked for at once, a moment apart, popping up where its still stood.
 * Throws if the scene can't be measured or a stage can't start (the caller leaves the stills as drawn).
 */
export function mountTitleScene(window: Window, root: HTMLElement, deps: TitleSceneDeps): TitleSceneHandle {
  const win = window as Window & typeof globalThis;
  const doc = win.document;
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let theme: Theme = resolvedScheme(doc);
  let layout = measureTitle(win, root);
  if (!layout) throw new Error('title scene: nothing to measure');
  const entered = new Set<string>();
  const timers: number[] = [];
  const parts = (Object.keys(TITLE_PARTS) as TitlePart[]).map((part) => {
    const layer = doc.createElement('div');
    layer.className = 'pals-title-layer';
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
    return { part, layer, first: true, stage: null as StageApi | null, ledges: [] as Ledge[], unit: 0 };
  });

  function place(p: (typeof parts)[number]): void {
    if (!layout) return;
    const b = partBox(p.part, layout);
    // the layers lie over one another (three of them the whole scene): only each one's characters take the pointer
    Object.assign(p.layer.style, {
      position: 'absolute', left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, zIndex: '3', pointerEvents: 'none',
    });
    if (p.part === 'meet') {
      // whoever walks off fades into the paper; beside the card, its near side is the card's edge (they come from behind it)
      // colour-fixed: a mask's luminance
      const fade = b.x > 0 ? 'linear-gradient(to right, #000 82%, transparent)' : 'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)';
      p.layer.style.setProperty('mask-image', fade);
      p.layer.style.setProperty('-webkit-mask-image', fade);
    }
    p.ledges = titleLedges(p.part, layout, p.first);
  }
  function build(p: (typeof parts)[number]): void {
    p.stage?.destroy();
    p.stage = null;
    if (!layout) return;
    const b = partBox(p.part, layout);
    p.unit = layout.unit;
    const cast = deps.cast.filter((c) => (TITLE_PARTS[p.part].cast as readonly string[]).includes(c.slug));
    const onEvent = (e: StageEvent) => {
      if (e.type === 'enter' && !entered.has(e.slug)) {
        entered.add(e.slug);
        deps.onEnter?.(e.slug);
        if (p.first) {
          p.first = false;
          place(p);
        }
      }
      if (e.type === 'act' && e.cause === 'poke' && deps.onPoke) {
        const v = p.stage?.visitors().find((x) => x.slug === e.slug);
        if (v) deps.onPoke(e.slug, bodyOf(v, b.x, b.y));
      }
    };
    p.stage = deps.createStage(
      {
        layer: p.layer,
        ledges: () => p.ledges,
        viewport: () => ({ x: 0, y: 0, w: b.w, h: b.h }),
        unitHeight: layout.unit,
        theme,
        reducedMotion: motionQuery.matches,
        clock: windowClock(win),
      },
      cast,
      { ...(p.part === 'meet' ? TITLE_MEET : TITLE_SOLO), onEvent },
    );
  }
  function begin(p: (typeof parts)[number], tries = 0): void {
    if (!p.stage || !p.first) return;
    if (!p.stage.visit(TITLE_PARTS[p.part].first) && tries < 12) timers.push(win.setTimeout(() => begin(p, tries + 1), 400));
  }

  parts.forEach((p, i) => {
    place(p);
    build(p);
    timers.push(win.setTimeout(() => begin(p), 150 + i * 450));
  });

  let width = layout.width;
  const resized = () => {
    const next = measureTitle(win, root);
    if (!next) return;
    const rebuild = Math.round(next.width) !== Math.round(width) || next.unit !== layout?.unit;
    layout = next;
    width = next.width;
    for (const p of parts) {
      place(p);
      if (rebuild) {
        build(p);
        begin(p);
      } else p.stage?.relayout();
    }
  };
  const watch = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
  watch?.observe(root);
  const onTheme = () => {
    theme = resolvedScheme(doc);
    for (const p of parts) p.stage?.setTheme(theme);
  };
  const onMotion = () => {
    for (const p of parts) p.stage?.setReducedMotion(motionQuery.matches);
  };
  darkQuery.addEventListener('change', onTheme);
  motionQuery.addEventListener('change', onMotion);
  const schemeWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(onTheme) : null;
  schemeWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });

  return {
    stages: () => parts.map((p) => p.stage).filter((s): s is StageApi => !!s),
    bodies: () =>
      parts.flatMap((p) => {
        if (!layout || !p.stage) return [];
        const b = partBox(p.part, layout);
        return p.stage.visitors().map((v) => ({ slug: v.slug, ...bodyOf(v, b.x, b.y) }));
      }),
    card: () => layout?.card ?? null,
    destroy() {
      timers.forEach((t) => win.clearTimeout(t));
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

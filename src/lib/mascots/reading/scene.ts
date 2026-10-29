/**
 * The reading pages' places for the stage, from plain geometry: what a home feed or a card's page shows (its cards,
 * a story's title, cover, paragraphs and response bar, the feed's foot), in the stage layer's px. The web measures it
 * from the DOM (./measure.ts); the apps' mascot island is handed it by the app, which knows where its views are — both
 * get the same places from the same rules here.
 *
 * Where a puppet goes on a page someone is reading: onto a card's top (climbed onto and sat on, or popped up onto and
 * stood on, pointing at its title), peeking over a card's top or past an outer card's side, walking along a phone's
 * band, onto the end of a story's title or its cover, beside a paragraph in a margin wide enough to stand in, over the
 * response bar at the story's end, beside 顯示更多 or napping by the feed's end — never over the words being read.
 * Round 20 (the owner: 「讓動畫不會看起來都差不多」): a card offers each of those ways, one at a time, so visits differ
 * as the landing page's do; and settings' strip under the 小紙團 switch (`settings`) is a little floor of its own.
 */
import { INK } from '@/lib/design/strokes';
import { bottom, firstLine, grow, inkTops, longestPiece, ON_PAPER, right, type Glyph } from '../landing/measure';
import type { Cover, EdgeLedge, Ledge, LineLedge, PeekLedge, Point, Rect, SpotLedge } from '../types';
import type { ReadingPreset } from './presets';

/** A card in a feed grid. */
export interface SceneCard {
  /**
   * The card's id: its places are named by it (`card-<key>-top`…), so whoever sits on a card stays there as the cards
   * around it come and go (a lazy list measures only those near the screen). Its place in the list otherwise.
   */
  key?: string;
  /** The card's drawn box: its outline's extent (a wobble swings past the frame it is laid out in). */
  box: Rect;
  /** Its drawn top edge, x ascending (its outline's, or a phone band's wavy rule); the box's top line otherwise. */
  top?: readonly Point[];
  /** The width of the pen its outline is drawn with (px; the web's INK by default): whoever is behind it stays under the whole line. */
  pen?: number;
  /**
   * Its drawn outline, points along it every few px (any order): its top edge and sides are read from it where `top`
   * isn't given — so one slid out past a side is cut along the line itself, not at the box (a wobble swings in and out).
   */
  outline?: readonly Point[];
  /** Its author row's ink: whoever sits on the card under it keeps off it. */
  foot?: readonly Rect[];
  /** Its title's words. */
  words?: readonly Rect[];
  radius?: number;
}

export interface ReadingScene {
  /** The page's (or the app view's) width, px. */
  width: number;
  /** The layer's height, px. */
  height: number;
  cards?: readonly SceneCard[];
  /** The story's column (a card's page). */
  column?: Rect | null;
  /** The story title: its glyphs (the web: each glyph's box and ink top) or the box of its first line (the apps). */
  title?: { glyphs?: readonly Glyph[]; firstLine?: Rect | null } | null;
  cover?: Rect | null;
  /** The story's blocks (paragraphs, headings, quotes, pictures), top to bottom. */
  paragraphs?: readonly Rect[];
  /** Something standing in the right margin beside the story (the contents rail): no places there. */
  rail?: Rect | null;
  /** The response bar at the story's end, and the foot of what is above it (its tags, the story). */
  respond?: Rect | null;
  respondCeiling?: number | null;
  /** The feed's 顯示更多, or its end line. */
  more?: Rect | null;
  end?: Rect | null;
  /** Words and buttons besides the above: props keep off them. */
  content?: readonly Rect[];
  /**
   * Settings → 外觀's strip under the 小紙團 row (round 20, the owner: a puppet there, so it is plain what the switch
   * is): `floor` the strip (walked along at its foot), `control` the switch over it (pointed at), `asleep` while the
   * switch is off — then one puppet naps there and nobody else comes.
   */
  settings?: { floor: Rect; control?: Rect | null; asleep?: boolean } | null;
}

export interface ReadingLayout {
  ledges: Ledge[];
  content: Rect[];
}

/** Sitting on a card's top. */
const SEAT_ACTS = ['read', 'swing', 'look', 'wave', 'reveal', 'deco', 'twinkle', 'nap'];
/** Standing on a card's top, popped up: its title to point at or beckon to. */
const STAND_ACTS = ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle', 'point', 'beckon', 'read'];
/** Rising over a card's top from behind it. */
const RISE_ACTS = ['look', 'wave', 'duck', 'beckon'];
/** Slid out past an outer card's side. */
const PEEK_ACTS = ['look', 'wave', 'duck', 'point', 'beckon'];
/** Walking along a phone's band, or settings' floor. */
const WALK_ACTS = ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle', 'read'];
const MARGIN_ACTS = ['read', 'look', 'wave', 'write', 'stretch', 'point', 'beckon', 'hop', 'deco', 'reveal', 'twinkle'];
/** Everyone may nap on settings' floor (`prefer` is what lets a character nap where it isn't a napper). */
const CAST_SLUGS = ['tuck', 'tag', 'card', 'dot', 'night'];

/** An outline's left or right edge, y ascending: the outermost point in each 6 px band from the corners down. */
export function sideOf(outline: readonly Point[], box: Rect, side: 'left' | 'right', radius = 18): Point[] {
  const out: Point[] = [];
  const near = outline.filter(([x]) => (side === 'left' ? x < box.x + box.w / 2 : x > box.x + box.w / 2));
  for (let y = Math.round(box.y + radius * 0.5); y <= bottom(box) - radius * 0.5; y += 6) {
    const row = near.filter(([, py]) => Math.abs(py - y) <= 3).map(([x]) => x);
    if (row.length) out.push([side === 'left' ? Math.min(...row) : Math.max(...row), y]);
  }
  return out;
}

/** An outline's top edge, x ascending: the topmost point in each 6 px column, the corners' arcs included. */
export function topOf(outline: readonly Point[], box: Rect): Point[] {
  const out: Point[] = [];
  const near = outline.filter(([, y]) => y < box.y + box.h / 2);
  for (let x = Math.round(box.x + 1); x <= right(box) - 1; x += 6) {
    const col = near.filter(([px]) => Math.abs(px - x) <= 3).map(([, y]) => y);
    if (col.length) out.push([x, Math.min(...col)]);
  }
  return out;
}

/** A flat edge along a rect's top, one point every 6 px from x0 to x1. */
function flatTop(y: number, x0: number, x1: number): Point[] {
  const out: Point[] = [];
  for (let x = Math.round(x0); x <= x1; x += 6) out.push([x, y]);
  return out;
}

/** The places for this scene under this preset. */
export function readingLedges(scene: ReadingScene, preset: ReadingPreset): ReadingLayout {
  const unit = preset.unitHeight;
  const arm = Math.round(unit * 0.12);
  const armClear = (r: Rect): Rect => ({ x: r.x - arm, y: r.y, w: r.w + 2 * arm, h: r.h });
  const L: Ledge[] = [];
  const content: Rect[] = [...(scene.content ?? [])];
  const add = <T extends Ledge>(l: T): T => {
    l.zone = 'feed';
    l.ink = l.ink ?? ON_PAPER;
    L.push(l);
    return l;
  };

  // --- cards (the feed's, or those under a story): sit on, stand on or peek over their tops, peek past the outer ones'
  // sides, walk along a phone's bands — one of a card's places at a time (its group)
  const cards = scene.cards ?? [];
  const cols = new Set(cards.map((c) => Math.round(c.box.x))).size;
  const minX = Math.min(...cards.map((c) => c.box.x));
  const maxR = Math.max(...cards.map((c) => right(c.box)));
  cards.forEach((c, i) => {
    content.push(...(c.words ?? []));
    const id = `card-${c.key ?? i + 1}`;
    const box = c.box;
    const drawnTop = c.top && c.top.length >= 2 ? [...c.top] : c.outline?.length ? topOf(c.outline, box) : [];
    const top = drawnTop.length >= 2 ? drawnTop : flatTop(box.y, box.x + 6, right(box) - 6);
    const sides = c.outline?.length
      ? { left: sideOf(c.outline, box, 'left', c.radius ?? 18), right: sideOf(c.outline, box, 'right', c.radius ?? 18) } : undefined;
    const cover: Cover = { ...box, top, radius: c.radius ?? 18, pen: c.pen ?? INK, sides };
    // the card right above it in its column: whoever sits here keeps off its author row
    const above = cards
      .filter((d) => d !== c && Math.abs(d.box.x - box.x) < 20 && bottom(d.box) <= box.y + 4)
      .sort((a, b) => bottom(b.box) - bottom(a.box))[0];
    const feet = above?.foot?.map((r) => grow(r, 4)) ?? [];
    const clear = feet.map(armClear);
    const words = c.words ?? [];
    const title: Point | undefined = words.length
      ? [(Math.min(...words.map((r) => r.x)) + Math.max(...words.map(right))) / 2, Math.min(...words.map((r) => r.y)) + 10] : undefined;
    const span: [number, number] = [box.x + 54, right(box) - 54];
    const seat = top.filter((p) => p[0] >= span[0] && p[0] <= span[1]);
    const roomy = span[1] - span[0] >= 60 && seat.length >= 2;
    // a phone's band runs edge to edge: walked onto from the side, where two can meet
    const band = cols === 1 && box.w >= scene.width - 24;
    if (band && top.length >= 2) {
      add<LineLedge>({
        id: `${id}-walk`, kind: 'line', group: id, points: top.filter((p) => p[0] >= box.x + 4 && p[0] <= right(box) - 4), meet: true,
        clear: clear.length ? clear : undefined, acts: WALK_ACTS, weight: 0.8,
      });
    }
    if (roomy) {
      add<EdgeLedge>({
        id: `${id}-top`, kind: 'edge', group: id, points: seat, stance: 'sit', cover, acts: SEAT_ACTS,
        clear: clear.length ? clear : undefined,
      });
      add<EdgeLedge>({
        id: `${id}-stand`, kind: 'edge', group: id, points: seat, stance: 'stand', enter: 'pop', target: title, acts: STAND_ACTS,
        clear: clear.length ? clear : undefined, weight: 0.7,
      });
    }
    // over its top from behind: in the widest gap the author row above it leaves (its avatar and name, its arrow), else
    // a third of the way in by turns — shown no higher than that row
    const gap = longestPiece([box.x + unit * 0.5, right(box) - unit * 0.5], feet.map((r) => [r.x - unit * 0.45, right(r) + unit * 0.45] as [number, number]));
    const px = gap && gap[1] - gap[0] >= 8 ? (gap[0] + gap[1]) / 2 : box.x + box.w * (i % 2 ? 0.68 : 0.32);
    const overHead = feet.filter((r) => r.x < px + unit * 0.45 && right(r) > px - unit * 0.45).map(bottom);
    // a peeker is behind the cards: it never rises over the card above's own line either (a band above has none — its
    // foot is this band's top rule)
    if (above && !band) overHead.push(bottom(above.box) + (above.pen ?? INK) + 1);
    if (box.w >= unit * 1.6) {
      add<PeekLedge>({
        // its feet just under the top (what of it is behind the card is never drawn): a tall card's foot may be off screen
        id: `${id}-peek`, kind: 'peek', group: id, side: 'top', cover, x: Math.round(px), ground: Math.min(bottom(box) - 4, Math.round(box.y + unit * 1.4)), show: 0.55,
        ceiling: overHead.length ? Math.max(...overHead) + 2 : undefined, acts: RISE_ACTS, weight: 0.6,
      });
    }
    if (preset.cardPeeks && cols > 1) {
      const side = Math.abs(box.x - minX) < 2 && minX >= 40 ? 'left' : Math.abs(right(box) - maxR) < 2 && scene.width - maxR >= 40 ? 'right' : null;
      if (side) {
        add<PeekLedge>({
          id: `${id}-${side}`, kind: 'peek', group: id, side, cover: { ...box, radius: c.radius ?? 18, pen: c.pen ?? INK, sides }, ground: bottom(box) - 4,
          target: title, acts: PEEK_ACTS,
        });
      }
    }
  });

  // --- a story: its cover's top, its title's end, the margins beside it, its response bar
  const cover = scene.cover ?? null;
  if (cover && cover.w > 160) {
    const along = flatTop(cover.y, cover.x + 48, right(cover) - 48);
    const behind: Cover = { ...cover, radius: 18, pen: INK };
    add<EdgeLedge>({
      id: 'cover-top', kind: 'edge', group: 'cover', points: along, stance: 'sit', cover: behind, acts: ['look', 'wave', 'swing', 'read', 'deco', 'twinkle'], weight: 0.7,
    });
    add<PeekLedge>({
      id: 'cover-peek', kind: 'peek', group: 'cover', side: 'top', cover: behind, x: Math.round(cover.x + cover.w * 0.7), ground: bottom(cover) - 4,
      show: 0.55, acts: RISE_ACTS, weight: 0.5,
    });
  }

  const title = scene.title ?? null;
  const glyphs = title?.glyphs?.length ? firstLine(title.glyphs) : [];
  const line = title?.firstLine ?? null;
  if (glyphs.length || line) {
    const x0 = glyphs.length ? glyphs[0].x0 : line!.x;
    const x1 = glyphs.length ? Math.max(...glyphs.map((g) => g.x1)) : right(line!);
    const top = glyphs.length ? Math.min(...glyphs.map((g) => g.top)) : line!.y + line!.h * 0.18;
    const foot = glyphs.length ? Math.max(...glyphs.map((g) => g.lineBottom)) : bottom(line!);
    content.push({ x: x0, y: top, w: x1 - x0, h: foot - top });
    // the line's end, a puppet's width or so of it
    const a = Math.max(x0 + 4, x1 - unit * 0.75);
    const b = x1 - 4;
    const pts = glyphs.length ? inkTops(glyphs, a, b) : flatTop(top, a, b);
    if (b - a >= 20 && pts.length >= 2) {
      add<EdgeLedge>({
        id: 'title-end', kind: 'edge', points: pts, stance: 'stand', enter: 'pop',
        ceiling: cover ? bottom(cover) + 2 : undefined, clear: cover ? [armClear(cover)] : undefined,
        acts: ['look', 'wave', 'stretch', 'read'],
      });
    }
  }

  const col = scene.column ?? null;
  const paras = scene.paragraphs ?? [];
  content.push(...paras);
  if (col && paras.length) {
    const room = unit * preset.marginRoom;
    const sides: ('left' | 'right')[] = [];
    if (col.x >= room) sides.push('left');
    if (scene.width - right(col) >= room && !scene.rail) sides.push('right');
    // a paragraph's foot every few puppets' heights down the story, sides by turns
    let last = -Infinity;
    let n = 0;
    for (const p of paras) {
      if (!sides.length || n >= 10) break;
      const y = bottom(p);
      if (y - last < unit * 2.6 || p.h < 18) continue;
      last = y;
      const side = sides[n % sides.length];
      const x = side === 'left' ? col.x - unit * 0.6 : right(col) + unit * 0.6;
      // two in a row on either side, level enough to see each other: they greet across the story
      const prev = L[L.length - 1];
      const across = prev?.kind === 'spot' && prev.id === `margin-${n}` && prev.from !== side && Math.abs(prev.y - y) < unit * 3.5;
      add<SpotLedge>({
        id: `margin-${n + 1}`, kind: 'spot', x: Math.round(x), y: Math.round(y), from: side, stance: 'stand',
        clear: [p], target: [side === 'left' ? p.x + 8 : right(p) - 8, p.y + p.h / 2], acts: MARGIN_ACTS,
        prefer: n % 3 === 2 ? ['night'] : undefined, partner: across ? prev.id : undefined,
      });
      if (across && prev.kind === 'spot') prev.partner = `margin-${n + 1}`;
      n++;
    }
  }

  const bar = scene.respond ?? null;
  if (bar) {
    content.push(bar);
    const ceiling = scene.respondCeiling ?? undefined;
    const target: Point = [bar.x + Math.min(bar.w / 3, 90), bar.y + bar.h / 2];
    add<PeekLedge>({
      id: 'respond', kind: 'peek', side: 'top', cover: { ...bar, radius: 16 }, ground: bottom(bar) - 1, show: 0.6,
      x: right(bar) - Math.min(48, bar.w / 4), ceiling, target, acts: ['look', 'wave', 'duck', 'point'],
    });
    if (col && right(col) - right(bar) >= unit * 0.9) {
      add<SpotLedge>({
        id: 'respond-side', kind: 'spot', meet: true, x: Math.round(right(bar) + unit * 0.5), y: Math.round(bottom(bar)), from: 'right',
        clear: [bar], reach: true, target: [right(bar) - 10, bar.y + bar.h / 2], acts: ['point', 'look', 'wave', 'hop'],
      });
    }
  }

  // --- the feed's foot: by 顯示更多, or napping by its end
  const more = scene.more ?? null;
  if (more) {
    content.push(more);
    const room = more.x - (col?.x ?? 0);
    const x = more.x - unit * 0.5;
    if (room > unit * 0.6) {
      const over = cards.map((c) => c.box).filter((r) => r.x < x + 70 && right(r) > x - 70 && bottom(r) < more.y).map(bottom);
      // sitting on the floor beside it: the gap under the cards is short of a standing puppet's height
      add<SpotLedge>({
        id: 'more', kind: 'spot', x: Math.round(x), y: Math.round(bottom(more) - 4), from: 'left', stance: 'floor', clear: [more],
        ceiling: over.length ? Math.max(...over) + 6 : undefined, target: [more.x + 8, more.y + more.h / 2], acts: ['look', 'wave', 'point'],
      });
    }
  }
  const end = scene.end ?? null;
  if (end) {
    content.push(end);
    add<SpotLedge>({
      id: 'feed-end', kind: 'spot', x: Math.round(right(end) + unit * 0.55), y: Math.round(bottom(end) + 1), from: 'right', stance: 'floor',
      prefer: ['night'], target: [right(end), end.y + 6], clear: [armClear(end)], acts: ['nap', 'look', 'twinkle'],
    });
  }

  // --- settings' strip: a floor along its foot and the switch over it; asleep, a nap and nothing else
  const strip = scene.settings ?? null;
  if (strip) {
    const f = strip.floor;
    // inside the stage's own margin (it keeps 10 px inside the view's foot)
    const y = Math.round(bottom(f) - 12);
    const knob = strip.control ?? null;
    const bed = Math.round(f.x + Math.min(f.w * 0.3, unit * 1.6));
    if (strip.asleep) {
      add<SpotLedge>({ id: 'settings-nap', kind: 'spot', x: bed, y, from: 'left', stance: 'floor', enter: 'walk', prefer: CAST_SLUGS, acts: ['nap'] });
    } else {
      add<LineLedge>({ id: 'settings-floor', kind: 'line', points: flatTop(y, f.x + 4, right(f) - 4), meet: true, acts: WALK_ACTS });
      // where the napper lay: woken (the switch turned on), it stands up right there
      add<SpotLedge>({
        id: 'settings-wake', kind: 'spot', x: bed, y, stance: 'stand', enter: 'pop', acts: ['stretch', 'wave', 'look', 'hop'], weight: 0.3,
      });
      if (knob) {
        add<SpotLedge>({
          id: 'settings-switch', kind: 'spot', meet: true, x: Math.round(Math.min(knob.x + knob.w / 2, right(f) - unit * 0.6)), y, from: 'right',
          target: [knob.x + knob.w / 2, knob.y + knob.h / 2], acts: ['point', 'beckon', 'look', 'wave', 'hop'], weight: 0.8,
        });
      }
    }
  }

  return { ledges: L, content };
}

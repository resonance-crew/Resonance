/**
 * The reading pages' places for the stage, from plain geometry: what a home feed or a card's page shows (its cards,
 * a story's title, cover, paragraphs and response bar, the feed's foot), in the stage layer's px. The web measures it
 * from the DOM (./measure.ts); the apps' mascot island is handed it by the app, which knows where its views are — both
 * get the same places from the same rules here.
 *
 * Where a puppet goes on a page someone is reading: onto a card's top or peeking past an outer card's side, onto the
 * end of a story's title or the top of its cover, beside a paragraph in a margin wide enough to stand in, over the
 * response bar at the story's end, beside 顯示更多 or napping by the feed's end — never over the words being read.
 */
import { bottom, firstLine, grow, inkTops, ON_PAPER, right, type Glyph } from '../landing/measure';
import type { Cover, EdgeLedge, Ledge, PeekLedge, Point, Rect, SpotLedge } from '../types';
import type { ReadingPreset } from './presets';

/** A card in a feed grid. */
export interface SceneCard {
  /** The card's drawn box. */
  box: Rect;
  /** Its drawn top edge, x ascending (its outline's, or a phone band's wavy rule); the box's top line otherwise. */
  top?: readonly Point[];
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
}

export interface ReadingLayout {
  ledges: Ledge[];
  content: Rect[];
}

const CARD_ACTS = ['read', 'swing', 'look', 'wave', 'reveal'];
const PEEK_ACTS = ['look', 'wave', 'duck'];
const MARGIN_ACTS = ['read', 'look', 'wave', 'write', 'stretch'];

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

  // --- cards (the feed's, or those under a story): sit on their tops, peek past the outer ones' sides
  const cards = scene.cards ?? [];
  const cols = new Set(cards.map((c) => Math.round(c.box.x))).size;
  const minX = Math.min(...cards.map((c) => c.box.x));
  const maxR = Math.max(...cards.map((c) => right(c.box)));
  cards.forEach((c, i) => {
    content.push(...(c.words ?? []));
    const box = c.box;
    const top = c.top && c.top.length >= 2 ? [...c.top] : flatTop(box.y, box.x + 6, right(box) - 6);
    // the card right above it in its column: whoever sits here keeps off its author row
    const above = cards
      .filter((d) => d !== c && Math.abs(d.box.x - box.x) < 20 && bottom(d.box) <= box.y + 4)
      .sort((a, b) => bottom(b.box) - bottom(a.box))[0];
    const clear = above?.foot?.map((r) => armClear(grow(r, 4))) ?? [];
    const span: [number, number] = [box.x + 54, right(box) - 54];
    const seat = top.filter((p) => p[0] >= span[0] && p[0] <= span[1]);
    if (span[1] - span[0] >= 60 && seat.length >= 2) {
      add<EdgeLedge>({
        id: `card-${i + 1}-top`, kind: 'edge', points: seat, stance: 'sit',
        cover: { ...box, top, radius: c.radius ?? 18 } satisfies Cover, acts: CARD_ACTS,
        clear: clear.length ? clear : undefined,
      });
    }
    if (preset.cardPeeks && cols > 1) {
      const side = Math.abs(box.x - minX) < 2 && minX >= 40 ? 'left' : Math.abs(right(box) - maxR) < 2 && scene.width - maxR >= 40 ? 'right' : null;
      if (side) {
        add<PeekLedge>({ id: `card-${i + 1}-${side}`, kind: 'peek', side, cover: { ...box, radius: c.radius ?? 18 }, ground: bottom(box) - 4, acts: PEEK_ACTS });
      }
    }
  });

  // --- a story: its cover's top, its title's end, the margins beside it, its response bar
  const cover = scene.cover ?? null;
  if (cover && cover.w > 160) {
    add<EdgeLedge>({
      id: 'cover-top', kind: 'edge', points: flatTop(cover.y, cover.x + 48, right(cover) - 48), stance: 'sit',
      cover: { ...cover, radius: 18 }, acts: ['look', 'wave', 'swing', 'read'], weight: 0.7,
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
      add<SpotLedge>({
        id: `margin-${n + 1}`, kind: 'spot', x: Math.round(x), y: Math.round(y), from: side, stance: 'stand',
        clear: [p], target: [side === 'left' ? p.x + 8 : right(p) - 8, p.y + p.h / 2], acts: MARGIN_ACTS,
        prefer: n % 3 === 2 ? ['night'] : undefined,
      });
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

  return { ledges: L, content };
}

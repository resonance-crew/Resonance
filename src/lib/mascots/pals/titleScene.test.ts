import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import { cardCover, partBox, placeSaid, titleLedges, TITLE_PARTS, type TitleLayout } from './titleScene';

/** A card's drawn outline round `card`, its top and bottom wobbling (a point every 4 px). */
function wobbly(c: { x: number; y: number; w: number; h: number }): Point[] {
  const out: Point[] = [];
  for (let x = c.x; x <= c.x + c.w; x += 4) {
    out.push([x, c.y + 3 * Math.sin(x / 30)], [x, c.y + c.h - 3 * Math.sin(x / 30)]);
  }
  for (let y = c.y + 20; y <= c.y + c.h - 20; y += 4) out.push([c.x - 2 * Math.sin(y / 25), y], [c.x + c.w + 2 * Math.sin(y / 25), y]);
  return out;
}

/** A wide opening: the card with room for 點點 on its left, the floor to its right. */
const WIDE: TitleLayout = {
  width: 1080,
  height: 420,
  unit: 116,
  card: { x: 110, y: 150, w: 560, h: 258 },
  stills: { tuck: { x: 244, y: 150 }, night: { x: 541, y: 150 }, dot: { x: 92, y: 408 }, card: { x: 786, y: 408 }, tag: { x: 931, y: 408 } },
  floor: { x: 670, y: 0, w: 410, h: 420 },
};

/** A narrow one: the card across the width, the floor under it. */
const NARROW: TitleLayout = {
  width: 358,
  height: 420,
  unit: 66,
  card: { x: 0, y: 80, w: 358, h: 224 },
  stills: { tuck: { x: 72, y: 80 }, night: { x: 286, y: 80 }, dot: { x: 179, y: 100 }, card: { x: 122, y: 408 }, tag: { x: 236, y: 408 } },
  floor: { x: 0, y: 304, w: 358, h: 116 },
};

describe("the Paper Pals page's opening", () => {
  it('seats 摺摺 and 悄悄 on the card where their stills stand, a pop-up only for their first visit', () => {
    const [seat, pop] = titleLedges('tuck', WIDE, true);
    expect(seat.kind).toBe('edge');
    expect(seat.kind === 'edge' && seat.stance).toBe('sit');
    const pts = seat.kind === 'edge' ? seat.points : [];
    expect((pts[0][0] + pts[1][0]) / 2).toBeCloseTo(244);
    expect(pts[0][1]).toBe(152);
    expect(pop.kind === 'edge' && pop.enter).toBe('pop');
    expect(titleLedges('night', WIDE).map((l) => l.id)).toEqual(['seat']);
    expect(titleLedges('night', WIDE)[0].acts).toContain('nap');
  });

  it("has 點點 peek past the card's side when there is room, over its top when there isn't", () => {
    const [wide] = titleLedges('dot', WIDE);
    expect(wide.kind === 'peek' && wide.side).toBe('left');
    const [narrow] = titleLedges('dot', NARROW);
    expect(narrow.kind === 'peek' && narrow.side).toBe('top');
    expect(narrow.kind === 'peek' && narrow.x).toBe(179);
  });

  it("puts the meeting on the floor's own layer: 聆聆 home where its still is, a floor to walk up along", () => {
    expect(partBox('meet', WIDE)).toEqual(WIDE.floor);
    expect(partBox('tuck', WIDE)).toEqual({ x: 0, y: 0, w: 1080, h: 420 });
    const ledges = titleLedges('meet', WIDE, true);
    const host = ledges.find((l) => l.id === 'host')!;
    expect(host.kind === 'spot' && host.x).toBe(786 - 670);
    expect(host.meet).toBe(true);
    expect(ledges.find((l) => l.id === 'floor')?.meet).toBe(true);
    expect(ledges.map((l) => l.id)).toContain('host-pop');
    // and the first visit asks for someone to walk up
    expect(TITLE_PARTS.meet.first.meet).toBe(true);
    expect(TITLE_PARTS.meet.cast).toEqual(['card', 'tag']);
  });

  it("hides 點點 behind the card's drawn line, not its box, and sits the two on that line", () => {
    const l: TitleLayout = { ...NARROW, outline: wobbly(NARROW.card), pen: 2.2 };
    const cover = cardCover(l);
    expect(cover.pen).toBe(2.2);
    expect(cover.top!.length).toBeGreaterThan(40);
    expect(cover.sides?.left?.length).toBeGreaterThan(10);
    // the top it is cut along follows the wobble
    const ys = cover.top!.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4);
    const [peek] = titleLedges('dot', l);
    expect(peek.kind === 'peek' && peek.cover?.top).toEqual(cover.top);
    // 摺摺's seat runs along the drawn top where it sits, a hair down onto the line
    const [seat] = titleLedges('tuck', l);
    const pts = seat.kind === 'edge' ? seat.points : [];
    expect(pts.length).toBeGreaterThan(4);
    for (const [x, y] of pts) {
      const at = cover.top!.find(([tx]) => tx === x)!;
      expect(y).toBeCloseTo(at[1] + 2);
    }
    // unread, it is the rounded box as before
    expect(cardCover(NARROW)).toEqual({ ...NARROW.card, radius: 20 });
  });

  it('puts what a tapped one says where it covers nobody and none of the card', () => {
    const pill = { w: 120, h: 32 };
    const bounds = { x: 4, y: -24, w: 350, h: 444 };
    // 摺摺 on the card's top with room over it: over its head, clear of the card
    const tuck = { x: 46, y: 60, w: 52, h: 66 };
    const above = placeSaid(pill, tuck, [{ ...NARROW.card, y: 126 }], bounds);
    expect(above.y + pill.h).toBeLessThanOrEqual(tuck.y);
    // with no room over it: beside its face, still clear of the card
    const high = placeSaid(pill, { ...tuck, y: 14 }, [NARROW.card], bounds);
    expect(high.y).toBeGreaterThanOrEqual(bounds.y);
    expect(high.y + pill.h).toBeLessThanOrEqual(NARROW.card.y);
    // 聆聆 on the floor under the card: beside it, not over the card's words or 牽牽
    const card = { x: 150, y: 342, w: 52, h: 66 };
    const tag = { x: 280, y: 300, w: 52, h: 108 };
    const p = placeSaid(pill, card, [NARROW.card, tag], bounds);
    const box = { ...p, ...pill };
    const hits = (r: { x: number; y: number; w: number; h: number }) =>
      box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y;
    expect(hits(NARROW.card)).toBe(false);
    expect(hits(tag)).toBe(false);
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    // never off the scene's sides
    const edge = placeSaid(pill, { x: 300, y: 342, w: 52, h: 66 }, [], bounds);
    expect(edge.x + pill.w).toBeLessThanOrEqual(bounds.x + bounds.w);
  });
});

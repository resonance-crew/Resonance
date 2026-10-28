import { describe, expect, it } from 'vitest';
import { READING_PRESETS, readingPresetFor } from './presets';
import { readingLedges, type ReadingScene } from './scene';

const card = (x: number, y: number, w = 360, h = 420) => ({
  box: { x, y, w, h },
  foot: [{ x: x + 20, y: y + h - 60, w: 120, h: 30 }],
  words: [{ x: x + 20, y: y + h - 140, w: 200, h: 24 }],
});

describe('the reading pages’ places', () => {
  it('seats a puppet on each feed card, peeks past the outer ones on a wide page, and sits it by 顯示更多', () => {
    const scene: ReadingScene = {
      width: 1280, height: 2000,
      cards: [card(80, 110), card(460, 110), card(840, 110), card(80, 560), card(460, 560), card(840, 560)],
      more: { x: 600, y: 1100, w: 88, h: 44 },
      column: { x: 80, y: 110, w: 1120, h: 1100 },
    };
    const ids = readingLedges(scene, READING_PRESETS.desktop).ledges.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['card-1-top', 'card-4-top', 'card-1-left', 'card-3-right', 'more']));
    // A middle card has no page margin to show in.
    expect(ids).not.toContain('card-2-left');
    // A phone's single column: no side peeks.
    const phone = readingLedges({ ...scene, width: 375, cards: [card(0, 60, 375), card(0, 500, 375)] }, READING_PRESETS.phone);
    expect(phone.ledges.some((l) => l.kind === 'peek')).toBe(false);
  });

  it('keeps a seat off the author row of the card above it', () => {
    const { ledges } = readingLedges({ width: 375, height: 1200, cards: [card(0, 0, 375), card(0, 420, 375)] }, READING_PRESETS.phone);
    const seat = ledges.find((l) => l.id === 'card-2-top')!;
    expect(seat.clear?.[0].y).toBeLessThan(420);
  });

  it('gives a story its margins only where there is room, sides by turns, and none over the contents rail', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => ({ x: 300, y: 300 + i * 120, w: 680, h: 90 }));
    const base: ReadingScene = { width: 1280, height: 2400, column: { x: 300, y: 120, w: 680, h: 1800 }, paragraphs };
    const both = readingLedges(base, READING_PRESETS.desktop).ledges.filter((l) => l.id.startsWith('margin-'));
    expect(both.length).toBeGreaterThan(2);
    expect(both.map((l) => (l.kind === 'spot' ? l.from : null))).toContain('right');
    // Never over the words: each spot stands outside the column.
    for (const l of both) if (l.kind === 'spot') expect(l.x < 300 || l.x > 980).toBe(true);
    const railed = readingLedges({ ...base, rail: { x: 1040, y: 120, w: 200, h: 300 } }, READING_PRESETS.desktop).ledges;
    expect(railed.filter((l) => l.kind === 'spot' && l.from === 'right')).toEqual([]);
    // A phone's column runs edge to edge: no margins.
    const phone = readingLedges({ ...base, width: 375, column: { x: 20, y: 120, w: 335, h: 1800 } }, READING_PRESETS.phone).ledges;
    expect(phone.some((l) => l.id.startsWith('margin-'))).toBe(false);
  });

  it('peeks over the response bar, kept under what is above it', () => {
    const { ledges } = readingLedges(
      { width: 375, height: 1200, column: { x: 20, y: 100, w: 335, h: 700 }, respond: { x: 20, y: 600, w: 335, h: 48 }, respondCeiling: 560 },
      READING_PRESETS.phone,
    );
    const peek = ledges.find((l) => l.id === 'respond');
    expect(peek).toMatchObject({ kind: 'peek', side: 'top', ceiling: 560 });
  });

  it('picks smaller puppets than the landing page’s, by the same widths', () => {
    expect(readingPresetFor(375).unitHeight).toBeLessThan(80);
    expect(readingPresetFor(800).name).toBe('tablet');
    expect(readingPresetFor(1280).unitHeight).toBeLessThan(120);
  });
});

import { describe, expect, it } from 'vitest';
import { verticalShift } from '../engine';
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
    expect(phone.ledges.some((l) => l.kind === 'peek' && l.side !== 'top')).toBe(false);
  });

  // Round 20 (the owner: visits all looked alike): a card offers several ways in, one at a time.
  it('offers a card sitting, standing, peeking over and (a phone’s band) walking along — one at a time', () => {
    const { ledges } = readingLedges({ width: 375, height: 1200, cards: [card(0, 0, 375), card(0, 420, 375)] }, READING_PRESETS.phone);
    const second = ledges.filter((l) => l.group === 'card-2');
    expect(second.map((l) => `${l.id}:${l.kind}`).sort()).toEqual(['card-2-peek:peek', 'card-2-stand:edge', 'card-2-top:edge', 'card-2-walk:line']);
    const walk = second.find((l) => l.kind === 'line');
    expect(walk).toMatchObject({ meet: true });
    // standing on it, it points at the card's own title
    const stand = second.find((l) => l.id === 'card-2-stand');
    expect(stand?.target?.[1]).toBeGreaterThan(420);
    // a grid's card is no band: nobody walks along it
    const grid = readingLedges({ width: 1280, height: 2000, cards: [card(80, 110), card(460, 110)] }, READING_PRESETS.desktop);
    expect(grid.ledges.some((l) => l.kind === 'line')).toBe(false);
  });

  it('names a card’s places by its key, so they stay its own as the list around it changes', () => {
    const keyed = (key: string, y: number) => ({ ...card(0, y, 375), key });
    const before = readingLedges({ width: 375, height: 1200, cards: [keyed('a', 0), keyed('b', 420)] }, READING_PRESETS.phone).ledges;
    const after = readingLedges({ width: 375, height: 1200, cards: [keyed('b', 420), keyed('c', 840)] }, READING_PRESETS.phone).ledges;
    const seatB = (ls: typeof before) => ls.find((l) => l.id === 'card-b-top');
    // the stage keeps whoever sits there where it is (a place that moved straight up or down, by nothing)
    expect(verticalShift(seatB(before)!, seatB(after)!)).toBe(0);
  });

  // A peeker is behind the cards: over a card's top it stays under the card above's line (a phone's band has none).
  it('keeps a peek over a card under the card above it', () => {
    const grid = readingLedges({ width: 1280, height: 2000, cards: [card(80, 110), card(80, 560)] }, READING_PRESETS.desktop).ledges;
    const peek = grid.find((l) => l.id === 'card-2-peek');
    expect(peek?.ceiling).toBeGreaterThanOrEqual(110 + 420 + 1.8);
    const bands = readingLedges({ width: 375, height: 1200, cards: [card(0, 0, 375), card(0, 420, 375)] }, READING_PRESETS.phone).ledges;
    expect(bands.find((l) => l.id === 'card-2-peek')?.ceiling ?? 0).toBeLessThan(420);
  });

  // The owner: the card's border stays in front of a puppet behind it.
  it('hands what a puppet hides behind its pen, so the whole line stays in front', () => {
    const { ledges } = readingLedges({ width: 375, height: 1200, cards: [{ ...card(0, 0, 375), pen: 2.4 }, card(0, 420, 375)] }, READING_PRESETS.phone);
    const seat = ledges.find((l) => l.id === 'card-1-top');
    expect(seat?.kind === 'edge' && seat.cover?.pen).toBe(2.4);
    const other = ledges.find((l) => l.id === 'card-2-top');
    expect(other?.kind === 'edge' && other.cover?.pen).toBeCloseTo(1.8);
  });

  it('cuts one slid out past a card along the card’s drawn side, read from its outline', () => {
    // a card whose left side bows in by 5 px halfway down
    const box = { x: 80, y: 110, w: 360, h: 420 };
    const outline: [number, number][] = [];
    for (let x = 80; x <= 440; x += 4) outline.push([x, 110], [x, 530]);
    for (let y = 110; y <= 530; y += 4) outline.push([80 + 5 * Math.sin(((y - 110) / 420) * Math.PI), y], [440, y]);
    const scene: ReadingScene = { width: 1280, height: 2000, cards: [{ ...card(80, 110), box, outline }, card(460, 110), card(840, 110)] };
    const peek = readingLedges(scene, READING_PRESETS.desktop).ledges.find((l) => l.id === 'card-1-left');
    const left = peek?.kind === 'peek' ? peek.cover.sides?.left ?? [] : [];
    const mid = left.find(([, y]) => Math.abs(y - 320) <= 3);
    expect(mid?.[0]).toBeCloseTo(85, 0);
    expect(left[0][1]).toBeLessThan(left[left.length - 1][1]);
  });

  it('gives settings’ strip a floor and the switch while awake, a nap alone while asleep', () => {
    const floor = { x: 0, y: 0, w: 420, h: 96 };
    const control = { x: 360, y: -40, w: 52, h: 30 };
    const awake = readingLedges({ width: 420, height: 96, settings: { floor, control } }, READING_PRESETS.phone).ledges;
    expect(awake.map((l) => l.id)).toEqual(['settings-floor', 'settings-wake', 'settings-switch']);
    expect(awake[2]).toMatchObject({ kind: 'spot', y: 84, target: [386, -25] });
    const asleep = readingLedges({ width: 420, height: 96, settings: { floor, control, asleep: true } }, READING_PRESETS.phone).ledges;
    expect(asleep).toEqual([expect.objectContaining({ id: 'settings-nap', stance: 'floor', acts: ['nap'] })]);
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

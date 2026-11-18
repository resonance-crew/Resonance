import { describe, expect, it } from 'vitest';
import { DECAY_PER_DAY, IGNORED_PAUSE_DAYS, READ_RETURN_DAYS, TASTE_MAX, W, bounced, cardWeight, heldBack, sums, tasteOf, type CardEvents } from './weights';

// Round 26 §A3.1: what a reader's own actions say about their taste — the table, the decay, ln(1 + s), and when a
// card is held back from their picks.

const NOW = Date.parse('2026-11-19T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => NOW - days * DAY;
const reading = (over: Partial<NonNullable<CardEvents['reading']>> = {}): NonNullable<CardEvents['reading']> => ({
  lastAt: NOW,
  reachedEndAt: null,
  rereads: 0,
  rereadAt: null,
  shared: false,
  activeSeconds: 60,
  maxProgress: 0.5,
  expectedSeconds: 120,
  ...over,
});
const w = (e: Omit<CardEvents, 'cardId'>) => cardWeight({ cardId: 'c', ...e }, NOW);

describe('the weights', () => {
  it('ranks a reply above a note above a tap above reading to the end, today', () => {
    const replied = w({ replied: NOW });
    const noted = w({ noted: NOW });
    const tapped = w({ tapped: NOW });
    const read = w({ reading: reading({ reachedEndAt: NOW }) });
    expect(replied).toBeCloseTo(Math.log1p(W.replied), 9);
    expect(noted).toBeCloseTo(Math.log1p(W.noted), 9);
    expect(tapped).toBeCloseTo(Math.log1p(W.tapped), 9);
    expect(read).toBeCloseTo(Math.log1p(W.readToEnd), 9);
    expect(replied).toBeGreaterThan(noted);
    expect(noted).toBeGreaterThan(tapped);
    expect(tapped).toBeGreaterThan(read);
  });

  it('weighs a save by whether the card was read to the end (C8: the order of the two never matters)', () => {
    expect(w({ saved: NOW, reading: reading({ reachedEndAt: NOW }) })).toBeCloseTo(Math.log1p(W.savedRead + W.readToEnd), 9);
    expect(w({ saved: NOW })).toBeCloseTo(Math.log1p(W.savedUnread), 9);
  });

  it('adds what a reading record holds: a share, re-reads up to two, a part read by min(progress, active ÷ expected)', () => {
    expect(sums({ cardId: 'c', reading: reading({ reachedEndAt: NOW, shared: true, rereads: 5, rereadAt: NOW }) }, NOW).positive).toBeCloseTo(
      W.readToEnd + W.shared + W.reread * W.rereadsCounted,
      9,
    );
    // Half the way down, a quarter of the time: a quarter counts.
    expect(sums({ cardId: 'c', reading: reading({ maxProgress: 0.5, activeSeconds: 30, expectedSeconds: 120 }) }, NOW).positive).toBeCloseTo(W.readPart * 0.25, 9);
    // An older record has no reading time: how far it went.
    expect(sums({ cardId: 'c', reading: reading({ maxProgress: 0.6, expectedSeconds: null }) }, NOW).positive).toBeCloseTo(W.readPart * 0.6, 9);
  });

  it('counts opening and leaving against a card only when a report says so (C7): no report is no signal', () => {
    const left = reading({ activeSeconds: 4, maxProgress: 0.05 });
    expect(bounced(left)).toBe(true);
    expect(w({ reading: left })).toBeCloseTo(-Math.log1p(Math.abs(W.bounced)), 9);
    expect(w({})).toBe(0);
  });

  it('decays every act by λ a day (half in about 69 days), but keeps the reader’s own card at a floor', () => {
    const halfLife = Math.log(2) / DECAY_PER_DAY;
    expect(sums({ cardId: 'c', tapped: ago(halfLife) }, NOW).positive).toBeCloseTo(W.tapped / 2, 6);
    expect(sums({ cardId: 'c', wrote: NOW }, NOW).positive).toBeCloseTo(W.wrote, 9);
    expect(sums({ cardId: 'c', wrote: ago(2 * 365) }, NOW).positive).toBe(W.wroteFloor);
  });

  it('takes a tap back with its weight, never below zero for it', () => {
    expect(w({ tappedEver: true })).toBe(0);
  });

  it("counts a card shown three times on days the reader opened their picks, never opened, against it", () => {
    expect(w({ shown: { n: 3, lastDay: '2026-11-18' } })).toBeLessThan(0);
    expect(w({ shown: { n: 2, lastDay: '2026-11-18' } })).toBe(0);
    // Opened since: no longer ignored.
    expect(w({ shown: { n: 5, lastDay: '2026-11-18' }, reading: reading({ reachedEndAt: NOW }) })).toBeGreaterThan(0);
  });
});

describe('heldBack', () => {
  it('never shows the reader their own card, nor one they answered, tapped (even taken back) or saved', () => {
    expect(heldBack({ cardId: 'c', wrote: ago(400) }, NOW)).toBe('own');
    for (const e of [{ replied: ago(400) }, { noted: ago(400) }, { tapped: ago(400) }, { tappedEver: true }, { saved: ago(400) }]) {
      expect(heldBack({ cardId: 'c', ...e }, NOW)).toBe('answered');
    }
  });

  it('lets a card read without any of those come back after 30 days, and a shown-and-ignored one after 14', () => {
    expect(heldBack({ cardId: 'c', reading: reading({ lastAt: ago(READ_RETURN_DAYS - 1) }) }, NOW)).toBe('read');
    expect(heldBack({ cardId: 'c', reading: reading({ lastAt: ago(READ_RETURN_DAYS + 1) }) }, NOW)).toBeNull();
    const day = (d: number) => new Date(ago(d)).toISOString().slice(0, 10);
    expect(heldBack({ cardId: 'c', shown: { n: 3, lastDay: day(IGNORED_PAUSE_DAYS - 2) } }, NOW)).toBe('paused');
    expect(heldBack({ cardId: 'c', shown: { n: 3, lastDay: day(IGNORED_PAUSE_DAYS + 1) } }, NOW)).toBeNull();
  });
});

describe('tasteOf', () => {
  it('keeps the strongest TASTE_MAX positive cards and the ones that count against, strongest first', () => {
    const events: CardEvents[] = [
      ...[...Array(30)].map((_, i) => ({ cardId: `read${String(i).padStart(2, '0')}`, reading: reading({ reachedEndAt: ago(i) }) })),
      { cardId: 'reply', replied: NOW },
      { cardId: 'left', reading: reading({ activeSeconds: 2, maxProgress: 0.01 }) },
      { cardId: 'nothing' },
    ];
    const taste = tasteOf(events, NOW);
    expect(taste.positive).toHaveLength(TASTE_MAX);
    expect(taste.positive[0].cardId).toBe('reply');
    expect(taste.positive[1].cardId).toBe('read00');
    expect(taste.negative.map((t) => t.cardId)).toEqual(['left']);
  });
});

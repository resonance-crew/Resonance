import { describe, expect, it, vi } from 'vitest';
import { MAX_PLAYING, StickerPlayback } from './stickerPlayback';

// Round 22 §4.5: a sticker plays on its first sight (once per message for the page), at most three move at once —
// one more starting stops the one that started first — and a replay of one moving starts it afresh.
describe('StickerPlayback', () => {
  it('lets a message play on its first sight only', () => {
    const p = new StickerPlayback();
    expect(p.firstSight('m1')).toBe(true);
    expect(p.firstSight('m1')).toBe(false);
    expect(p.firstSight('m2')).toBe(true);
  });

  it('keeps at most three moving, the first started giving way', () => {
    const p = new StickerPlayback();
    const stops = Array.from({ length: 5 }, () => vi.fn());
    stops.forEach((stop, i) => p.start(`m${i}`, stop));
    expect(MAX_PLAYING).toBe(3);
    expect(p.moving).toEqual(['m2', 'm3', 'm4']);
    expect(stops.map((s) => s.mock.calls.length)).toEqual([1, 1, 0, 0, 0]);
  });

  it('starts a replay afresh, and ends a play once — its own end ending nothing after it gave way', () => {
    const p = new StickerPlayback(2);
    const first = vi.fn();
    const release = p.start('m1', first);
    const again = vi.fn();
    p.start('m1', again);
    // The replay stopped the play before it.
    expect(first).toHaveBeenCalledTimes(1);
    expect(p.moving).toEqual(['m1']);
    release();
    expect(p.moving).toEqual(['m1']);

    p.start('m2', vi.fn());
    p.end('m1');
    expect(again).toHaveBeenCalledTimes(1);
    expect(p.moving).toEqual(['m2']);
    p.end('m1');
    expect(again).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BREATH_REST_MS, BREATH_STAGGER_MS, StickerBreath } from './stickerBreath';
import { StickerPlayback, stickerPlayback } from './stickerPlayback';

// Round 23 (the owner's: only the stickers in view move, and never so many that it weighs on the phone): the
// picker's cells breathe — play once, rest on their key frame, play again — a few at a time, in reading order.
describe('the sticker picker’s breathing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const LOOP = 2000;
  /** `n` cells in reading order, each logging its plays and stops. */
  function grid(breath: StickerBreath, n: number) {
    const log: string[] = [];
    for (let i = 0; i < n; i++) {
      breath.add(`c${i}`, i, { loopMs: LOOP, play: () => log.push(`play c${i}`), stop: () => log.push(`stop c${i}`) });
    }
    return log;
  }
  const breath = (max: number) => new StickerBreath(max, () => 0.5, () => Date.now());

  it('starts the cells in view in reading order, one every 80 ms, no more than its limit at once', () => {
    const b = breath(3);
    grid(b, 6);
    // The watcher's batch, in whatever order it comes: taken in reading order.
    for (const k of ['c4', 'c0', 'c2', 'c1', 'c5', 'c3']) b.see(k, true);
    expect(b.playing).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(b.playing).toEqual(['c0']);
    vi.advanceTimersByTime(BREATH_STAGGER_MS);
    expect(b.playing).toEqual(['c0', 'c1']);
    vi.advanceTimersByTime(BREATH_STAGGER_MS);
    expect(b.playing).toEqual(['c0', 'c1', 'c2']);
    vi.advanceTimersByTime(BREATH_STAGGER_MS * 10);
    expect(b.playing).toHaveLength(3);
    expect(b.waiting).toEqual(['c3', 'c4', 'c5']);
  });

  it('plays a cell’s two loops, rests it 1.5–3 s on its key frame, and gives its turn to the next meanwhile', () => {
    const b = breath(1);
    const log = grid(b, 2);
    b.see('c0', true);
    b.see('c1', true);
    vi.advanceTimersByTime(0);
    expect(log).toEqual(['play c0']);
    vi.advanceTimersByTime(LOOP * 2 + 120);
    // Back on its key frame; the other one's turn (after the stagger since the last start has long passed).
    expect(log).toEqual(['play c0', 'stop c0', 'play c1']);
    expect(b.waiting).toEqual([]);
    // Its rest: half way between 1.5 and 3 s here; then it waits for a turn again.
    const rest = BREATH_REST_MS[0] + 0.5 * (BREATH_REST_MS[1] - BREATH_REST_MS[0]);
    vi.advanceTimersByTime(rest);
    expect(b.waiting).toEqual(['c0']);
    vi.advanceTimersByTime(LOOP * 2 + 120 - rest);
    expect(log.slice(-2)).toEqual(['stop c1', 'play c0']);
  });

  it('stops a cell that leaves the view at once, its turn going to the next', () => {
    const b = breath(1);
    const log = grid(b, 2);
    b.see('c0', true);
    b.see('c1', true);
    vi.advanceTimersByTime(500);
    b.see('c0', false);
    vi.advanceTimersByTime(BREATH_STAGGER_MS);
    expect(log).toEqual(['play c0', 'stop c0', 'play c1']);
    // Out of view, it never comes back by itself.
    vi.advanceTimersByTime(20_000);
    expect(log.filter((l) => l === 'play c0')).toHaveLength(1);
  });

  it('starts no one while the grid is being scrolled, and those waiting go once it stops', () => {
    const b = breath(4);
    grid(b, 4);
    b.hold(true);
    for (let i = 0; i < 4; i++) b.see(`c${i}`, true);
    vi.advanceTimersByTime(1000);
    expect(b.playing).toEqual([]);
    b.hold(false);
    vi.advanceTimersByTime(0);
    expect(b.playing).toEqual(['c0']);
    vi.advanceTimersByTime(BREATH_STAGGER_MS * 3);
    expect(b.playing).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('stops everyone when the picker goes, and starts nothing after', () => {
    const b = breath(2);
    const log = grid(b, 3);
    for (let i = 0; i < 3; i++) b.see(`c${i}`, true);
    vi.advanceTimersByTime(BREATH_STAGGER_MS);
    b.dispose();
    expect(log).toEqual(['play c0', 'play c1', 'stop c0', 'stop c1']);
    vi.advanceTimersByTime(30_000);
    expect(log).toHaveLength(4);
  });

  it('is the picker’s own: the thread’s stickers keep playing beside it', () => {
    const b = breath(12);
    grid(b, 12);
    const thread = new StickerPlayback();
    const stopped = vi.fn();
    thread.start('message-1', stopped);
    for (let i = 0; i < 12; i++) b.see(`c${i}`, true);
    vi.advanceTimersByTime(BREATH_STAGGER_MS * 13);
    expect(b.playing).toHaveLength(12);
    expect(stopped).not.toHaveBeenCalled();
    expect(thread.moving).toEqual(['message-1']);
    expect(stickerPlayback.moving).toEqual([]);
  });
});

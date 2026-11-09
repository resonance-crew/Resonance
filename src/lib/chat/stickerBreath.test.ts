import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePrng } from '@/lib/design/prng';
import { STICKER_PACKS, stickerOf } from '@/lib/stickers/catalog';
import { BREATH_REST_MS, BREATH_STAGGER_MS, StickerBreath } from './stickerBreath';
import { StickerPlayback, stickerPlayback } from './stickerPlayback';

// Round 23 (the owner's: only the stickers in view move, and never so many that it weighs on the phone): the
// picker's cells breathe — play once, rest on their key frame, play again — a few at a time, first come, first served.
describe('the sticker picker’s breathing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const LOOP = 2000;
  /** `n` cells in reading order, each logging its plays and stops. */
  function grid(breath: StickerBreath, n: number) {
    const log: string[] = [];
    for (let i = 0; i < n; i++) {
      breath.add(`c${i}`, i, {
        loopMs: LOOP,
        play: () => {
          log.push(`play c${i}`);
        },
        stop: () => {
          log.push(`stop c${i}`);
        },
      });
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

  // Round 23 review: a play (two loops, 4.3–5.3 s) outlasts the longest rest (3 s), so turns handed out in reading
  // order went round the first 2 × max cells for ever. First come, first served: every cell in view has its turn.
  it('gives every cell in view its turn, however many more there are than it plays at once', () => {
    // The grid's cells in reading order — the recents' six, then every pack — each with its own loop's length.
    const loops = STICKER_PACKS.flatMap((p) => p.stickers.map((s) => stickerOf(p.id, s.id)!.durationMs));
    for (const [cellsInView, max] of [
      [24, 6], // a grown phone panel: six rows of four, the web phone's limit
      [24, 8], // the same at the apps' phone limit
      [36, 12], // a grown tablet panel
    ]) {
      const b = new StickerBreath(max, makePrng(cellsInView * 31 + max), () => Date.now());
      const plays = new Array<number>(cellsInView).fill(0);
      for (let i = 0; i < cellsInView; i++) {
        b.add(`c${i}`, i, {
          loopMs: loops[(i + 30 - 6) % loops.length],
          play: () => {
            plays[i]++;
          },
          stop: () => {},
        });
      }
      for (let i = 0; i < cellsInView; i++) b.see(`c${i}`, true);
      vi.advanceTimersByTime(120_000);
      // Never more than its limit at once, meanwhile or at the end.
      expect(b.playing.length).toBeLessThanOrEqual(max);
      const fewest = Math.min(...plays);
      const most = Math.max(...plays);
      expect(fewest, `${cellsInView} cells at ${max}`).toBeGreaterThanOrEqual(2);
      expect(most, `${cellsInView} cells at ${max}`).toBeLessThanOrEqual(fewest * 2);
      b.dispose();
    }
  });

  it('serves the cell waiting longest first, reading order only among those that began waiting together', () => {
    const b = breath(1);
    const log = grid(b, 4);
    // c2 and c3 come into view together, in whatever order: c2 goes first. c0 comes a moment later.
    b.see('c3', true);
    b.see('c2', true);
    vi.advanceTimersByTime(10);
    expect(log).toEqual(['play c2']);
    b.see('c0', true);
    // c3 has waited longer, though c0 comes first in reading order.
    expect(b.waiting).toEqual(['c3', 'c0']);
    const play = LOOP * 2 + 120;
    vi.advanceTimersByTime(play * 3);
    // Then c0; then c2 again, whose rest ended before c3's did.
    expect(log).toEqual(['play c2', 'stop c2', 'play c3', 'stop c3', 'play c0', 'stop c0', 'play c2']);
  });

  // Round 23 review: a first play fetches its file; its loops run from when it is showing, not from the ask.
  it('times a play from when its file is showing, and never shows one that arrives after its turn ended', async () => {
    const b = breath(1);
    const log: string[] = [];
    const arrivals: Array<() => void> = [];
    for (const k of ['c0', 'c1']) {
      b.add(k, k === 'c0' ? 0 : 1, {
        loopMs: LOOP,
        play: () => {
          log.push(`play ${k}`);
          return new Promise<void>((resolve) => arrivals.push(resolve));
        },
        stop: () => {
          log.push(`stop ${k}`);
        },
      });
    }
    b.see('c0', true);
    vi.advanceTimersByTime(0);
    expect(log).toEqual(['play c0']);
    // Its file comes a second and a half later: its two loops run from then.
    vi.advanceTimersByTime(1500);
    arrivals.shift()!();
    await Promise.resolve();
    vi.advanceTimersByTime(LOOP * 2 + 120 - 1);
    expect(log).toEqual(['play c0']);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['play c0', 'stop c0']);

    // c1's file is still on its way when it leaves the view: arriving after, it starts no timer and takes no turn.
    b.see('c1', true);
    vi.advanceTimersByTime(BREATH_STAGGER_MS);
    expect(b.playing).toEqual(['c1']);
    b.see('c1', false);
    expect(b.playing).toEqual([]);
    arrivals.shift()!();
    await Promise.resolve();
    vi.advanceTimersByTime(LOOP * 4);
    expect(log.filter((l) => l.endsWith('c1'))).toEqual(['play c1', 'stop c1']);
    expect(b.playing).not.toContain('c1');
  });

  it('holds a turn a play’s length when its file can’t be shown, or never comes', async () => {
    const b = breath(1);
    const log: string[] = [];
    let fail = true;
    b.add('c0', 0, {
      loopMs: LOOP,
      play: () => {
        log.push('play');
        return fail ? Promise.reject(new Error('offline')) : new Promise(() => {});
      },
      stop: () => {
        log.push('stop');
      },
    });
    b.see('c0', true);
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    // Failed: still on its key frame, the turn held for a play's length (a failing site isn't asked every 80 ms).
    expect(log).toEqual(['play']);
    vi.advanceTimersByTime(LOOP * 2 + 120 - 1);
    expect(log).toEqual(['play']);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['play', 'stop']);
    expect(b.playing).toEqual([]);
    // Then a rest, and it is asked again.
    fail = false;
    vi.advanceTimersByTime(BREATH_REST_MS[1]);
    expect(log).toEqual(['play', 'stop', 'play']);
    // Never showing: the turn is given up after a play's length.
    vi.advanceTimersByTime(LOOP * 2 + 120);
    expect(log).toEqual(['play', 'stop', 'play', 'stop']);
    expect(b.playing).toEqual([]);
  });

  // Round 23 review: offline, every cell's file failing — the picker asks no faster than its plays would run.
  it('asks a failing site no faster than its plays would run', async () => {
    const b = breath(6);
    let asked = 0;
    for (let i = 0; i < 24; i++) {
      b.add(`c${i}`, i, {
        loopMs: LOOP,
        play: () => {
          asked += 1;
          return Promise.reject(new Error('offline'));
        },
        stop: () => {},
      });
      b.see(`c${i}`, true);
    }
    for (let t = 0; t < 60_000; t += BREATH_STAGGER_MS) {
      vi.advanceTimersByTime(BREATH_STAGGER_MS);
      await Promise.resolve();
      await Promise.resolve();
    }
    // Six turns, each held a play's length (4.12 s) — the load a picker playing would make, about 1.5 asks a second,
    // never one every 80 ms (a turn given up at once made it hundreds a minute).
    expect(asked).toBeLessThanOrEqual(6 * Math.ceil(60_000 / (LOOP * 2 + 120)) + 6);
    expect(asked).toBeGreaterThanOrEqual(24);
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

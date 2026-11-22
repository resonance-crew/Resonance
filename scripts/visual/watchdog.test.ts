import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchdog } from './watchdog';

afterEach(() => vi.useRealTimers());

describe('watchdog', () => {
  it('lets a run that keeps saying something go on, and ends one that goes quiet', () => {
    vi.useFakeTimers();
    let t = 0;
    const ended: string[] = [];
    const dog = watchdog((why) => ended.push(why), { stallMs: 30 * 60_000, totalMs: 300 * 60_000, checkMs: 1000, now: () => t });
    // Forty minutes of captures, one line every two minutes.
    for (let m = 2; m <= 40; m += 2) {
      t = m * 60_000;
      dog.progress();
      vi.advanceTimersByTime(1000);
    }
    expect(ended).toEqual([]);
    // Then a command that never answers.
    t += 31 * 60_000;
    vi.advanceTimersByTime(1000);
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatch(/nothing moved for 31 min.*VISUAL_STALL_MIN/);
    // Said once only.
    t += 60 * 60_000;
    vi.advanceTimersByTime(5000);
    expect(ended).toHaveLength(1);
  });

  it('ends a run past its whole limit even while it moves, and never after stop()', () => {
    vi.useFakeTimers();
    let t = 0;
    const ended: string[] = [];
    const dog = watchdog((why) => ended.push(why), { stallMs: 30 * 60_000, totalMs: 60 * 60_000, checkMs: 1000, now: () => t });
    t = 61 * 60_000;
    dog.progress();
    vi.advanceTimersByTime(1000);
    expect(ended[0]).toMatch(/passed its 60 min limit/);

    const quiet: string[] = [];
    const done = watchdog((why) => quiet.push(why), { stallMs: 1000, totalMs: 2000, checkMs: 100, now: () => t });
    done.stop();
    t += 10_000;
    vi.advanceTimersByTime(1000);
    expect(quiet).toEqual([]);
  });
});

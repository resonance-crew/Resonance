import { describe, expect, it } from 'vitest';
import { nextMeta, oldestCommit, type BaselineMeta } from './baselineMeta';

// Commit times, oldest first; `gone` is a commit this checkout no longer has.
const TIMES: Record<string, number> = { c1: 100, c2: 200, c3: 300 };
const age = (c: string) => TIMES[c] ?? null;
const at = (commit: string, run: string) => ({ commit, run, acceptedAt: `${run}T`, reason: `ok ${run}` });

const CARD = 'ios/iphone/card@light-zh-TW.png';
const HOME = 'ios/iphone/home@light-zh-TW.png';
const PAD = 'ios/ipad/home@light-zh-TW.png';

describe('nextMeta', () => {
  it('an accept of a few screens keeps the platform’s start at the older pictures’ commit (the --only bug)', () => {
    const full = nextMeta(null, [CARD, HOME, PAD], [CARD, HOME, PAD], at('c1', 'r1'), age);
    expect(full.commit).toBe('c1');
    // `accept --only card` from a later commit: card's picture is c2's, home's and the iPad's still c1's.
    const some = nextMeta(full, [CARD], [CARD, HOME, PAD], at('c2', 'r2'), age);
    expect(some.commit).toBe('c1');
    expect(some.captures).toEqual({ [CARD]: { commit: 'c2', run: 'r2', acceptedAt: 'r2T' }, [HOME]: { commit: 'c1', run: 'r1', acceptedAt: 'r1T' }, [PAD]: { commit: 'c1', run: 'r1', acceptedAt: 'r1T' } });
    // The latest accept is still what run / acceptedAt / reason say.
    expect(some).toMatchObject({ run: 'r2', acceptedAt: 'r2T', reason: 'ok r2' });
    // Once every picture is newer, the start moves up.
    expect(nextMeta(some, [HOME, PAD], [CARD, HOME, PAD], at('c3', 'r3'), age).commit).toBe('c2');
  });

  it('takes a meta written before per-capture commits as every old picture’s commit', () => {
    const legacy: BaselineMeta = { commit: 'c1', run: 'r1', acceptedAt: 'r1T', reason: 'old' };
    const next = nextMeta(legacy, [CARD], [CARD, HOME], at('c3', 'r3'), age);
    expect(next.commit).toBe('c1');
    expect(next.captures![HOME].commit).toBe('c1');
  });

  it('forgets pictures no longer in the baseline', () => {
    const full = nextMeta(null, [CARD, HOME], [CARD, HOME], at('c1', 'r1'), age);
    const next = nextMeta(full, [CARD], [CARD], at('c2', 'r2'), age);
    expect(Object.keys(next.captures!)).toEqual([CARD]);
    expect(next.commit).toBe('c2');
  });
});

describe('oldestCommit', () => {
  it('picks the oldest it can date, and a commit it can’t date only when nothing else is known', () => {
    expect(oldestCommit(['c3', 'c1', 'c2'], age)).toBe('c1');
    expect(oldestCommit(['gone', 'c2'], age)).toBe('c2');
    expect(oldestCommit(['gone'], age)).toBe('gone');
    expect(oldestCommit(['', ''], age)).toBeNull();
  });
});

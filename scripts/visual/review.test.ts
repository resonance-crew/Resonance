import { describe, expect, it } from 'vitest';
import { names, readTrailer, visualLines } from './review';

describe('a Visual: line', () => {
  it('names the screens before its first colon', () => {
    expect(readTrailer('card, ios/thread: the composer’s ＋ sits inside the capsule')).toEqual({
      targets: ['card', 'ios/thread'],
      reason: 'the composer’s ＋ sits inside the capsule',
    });
    expect(readTrailer('web/phone/landing: the film’s foot').targets).toEqual(['web/phone/landing']);
  });

  it('names every screen with *, written out', () => {
    expect(readTrailer('*: the header’s pen line is a shade lighter').targets).toEqual(['*']);
  });

  it('names the screens among the first words of a line written loosely', () => {
    expect(readTrailer('landing (desktop web): the scrollbar is drawn over the film')).toEqual({
      targets: ['landing'],
      reason: 'the scrollbar is drawn over the film',
    });
    expect(readTrailer('landing (web) — the landing page is now the film').targets).toEqual(['landing']);
  });

  it('names no screen when it says none, or names none it knows — never every screen', () => {
    for (const value of ['none — the captures have no address bar; checked on a Pixel 10 Pro in Chrome', 'none', 'None: tests only']) {
      expect(readTrailer(value).targets).toEqual([]);
    }
    expect(readTrailer('the header’s pen line is a shade lighter').targets).toEqual([]);
    expect(readTrailer('the sky: a gradient now').targets).toEqual([]);
    expect(readTrailer('ios/nothing-like-this: why').targets).toEqual([]);
  });
});

describe('the Visual: lines of a log', () => {
  it('reads them anywhere in a message — a paragraph of their own above Co-Authored-By too — each with its commit', () => {
    const log = [
      'abc1234\x1ffix: 🎬 the sun\n\nWhy it changed.\n\nVisual: landing: no change intended\n\nCo-Authored-By: Claude <x@y>\n',
      'def5678\x1ffeat: two screens\n\nVisual: card: shorter\nVisual: ios/thread: the ＋ moved\nCo-Authored-By: Claude <x@y>\n',
      'aaa0000\x1fchore: nothing to see\n\nNot a Visual: line in running text.\n',
    ].join('\x1e');
    expect(visualLines(log)).toEqual([
      { commit: 'abc1234', value: 'landing: no change intended' },
      { commit: 'def5678', value: 'card: shorter' },
      { commit: 'def5678', value: 'ios/thread: the ＋ moved' },
    ]);
  });
});

describe('names', () => {
  const key = 'ios/iphone/card@dark-zh-TW.png';
  it('matches a screen, a platform’s screen, a device’s screen, or every screen', () => {
    expect(['card', 'ios/card', 'ios/iphone/card', '*'].map((t) => names(t, key))).toEqual([true, true, true, true]);
    expect(['home', 'android/card', 'ios/ipad/card'].map((t) => names(t, key))).toEqual([false, false, false]);
  });
});

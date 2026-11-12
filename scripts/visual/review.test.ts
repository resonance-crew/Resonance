import { describe, expect, it } from 'vitest';
import { names, readTrailer } from './review';

describe('a Visual: trailer', () => {
  it('names the screens before its first colon', () => {
    expect(readTrailer('card, ios/thread: the composer’s ＋ sits inside the capsule')).toEqual({
      targets: ['card', 'ios/thread'],
      reason: 'the composer’s ＋ sits inside the capsule',
    });
  });

  it('names every screen with * — or with no targets at all', () => {
    expect(readTrailer('*: the header’s pen line is a shade lighter').targets).toEqual(['*']);
    expect(readTrailer('the header’s pen line is a shade lighter').targets).toEqual(['*']);
  });

  it('names no screen when it says none (it would otherwise explain every change)', () => {
    for (const value of ['none — the captures have no address bar; checked on a Pixel 10 Pro in Chrome', 'none', 'None: tests only']) {
      expect(readTrailer(value)).toEqual({ targets: [], reason: value });
    }
    expect(readTrailer('nonesuch: a screen of that name').targets).toEqual(['nonesuch']);
  });
});

describe('names', () => {
  const key = 'ios/iphone/card@dark-zh-TW.png';
  it('matches a screen, a platform’s screen, a device’s screen, or every screen', () => {
    expect(['card', 'ios/card', 'ios/iphone/card', '*'].map((t) => names(t, key))).toEqual([true, true, true, true]);
    expect(['home', 'android/card', 'ios/ipad/card'].map((t) => names(t, key))).toEqual([false, false, false]);
  });
});

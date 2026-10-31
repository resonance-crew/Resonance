import { describe, expect, it, vi } from 'vitest';
import { MAX_PLAYING, StickerPlayback, artTopOf } from './stickerPlayback';

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

// Round 22 (the owner's): a sticker answering a quote comes up over it by its drawing, not its square — how far
// down its square the drawing starts is read once per picture from its key frame.
describe('artTopOf', () => {
  it('finds the first row the drawing reaches, once per picture', () => {
    const reads = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          reads();
          const data = new Uint8ClampedArray(w * h * 4);
          // Clear above row 8, the drawing from there (one opaque pixel is enough).
          data[(8 * w + 5) * 4 + 3] = 255;
          return { data };
        },
      }),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    const img = { currentSrc: '/stickers/nod/hug.thumb.webp?v=1', src: '', naturalWidth: 256 } as unknown as HTMLImageElement;
    expect(artTopOf(img)).toBe(8 / 32);
    expect(artTopOf(img)).toBe(8 / 32);
    expect(reads).toHaveBeenCalledTimes(1);
    // Nothing readable (no canvas): no room taken off.
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    expect(artTopOf({ currentSrc: '/stickers/pip/hi.thumb.webp?v=1', naturalWidth: 256 } as unknown as HTMLImageElement)).toBe(0);
    vi.unstubAllGlobals();
  });
});

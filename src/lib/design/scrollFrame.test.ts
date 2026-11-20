// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onScrollPassive } from './scrollFrame';

// W21: the headers read the scroll at most once a frame, from a passive listener, and stop when taken off.
describe('onScrollPassive', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = () => {};
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('listens passively and runs once a frame however many events come', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const fn = vi.fn();
    const off = onScrollPassive(fn);
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('scroll'));
    expect(fn).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(fn).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(2);
    off();
    frames[1](0);
    window.dispatchEvent(new Event('scroll'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(2);
  });
});

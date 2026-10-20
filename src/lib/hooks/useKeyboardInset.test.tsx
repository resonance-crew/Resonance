// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardInset } from './useKeyboardInset';

/** A visualViewport the test moves: a keyboard rising shrinks it from the foot. */
function stubViewport(height: number, offsetTop = 0) {
  const target = new EventTarget();
  const vv = Object.assign(target, { height, offsetTop, width: 390, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  return {
    move(h: number, top = 0) {
      vv.height = h;
      vv.offsetTop = top;
      vv.dispatchEvent(new Event('resize'));
    },
    scroll(top: number) {
      vv.offsetTop = top;
      vv.dispatchEvent(new Event('scroll'));
    },
  };
}
const frames = () => act(() => vi.advanceTimersByTimeAsync(20));

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
});

describe('useKeyboardInset', () => {
  it('follows the keyboard as it rises, scrolls the page under it and goes', async () => {
    vi.useFakeTimers();
    const vv = stubViewport(844);
    const { result } = renderHook(() => useKeyboardInset());
    await frames();
    expect(result.current).toBe(0);

    vv.move(508);
    await frames();
    expect(result.current).toBe(336);

    // iOS scrolls the visual viewport down the page under the keyboard: the keyboard covers less of the layout.
    vv.scroll(40);
    await frames();
    expect(result.current).toBe(296);

    vv.move(844, 0);
    await frames();
    expect(result.current).toBe(0);
  });

  it('is 0 while no field has the focus, and where there is no visualViewport', async () => {
    vi.useFakeTimers();
    stubViewport(508);
    const { result, rerender } = renderHook(({ on }) => useKeyboardInset(on), { initialProps: { on: false } });
    await frames();
    expect(result.current).toBe(0);
    rerender({ on: true });
    await frames();
    expect(result.current).toBe(336);

    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    const bare = renderHook(() => useKeyboardInset());
    await frames();
    expect(bare.result.current).toBe(0);
  });
});

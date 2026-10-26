// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

// Read on every render of every reader: one MediaQueryList per query, its
// changes reaching each reader.

afterEach(() => vi.unstubAllGlobals());

/** A browser where `(min-width: 1200px)` matches as `wide` says, telling its listeners when it changes. */
function browser() {
  const state = { wide: false, listeners: new Set<() => void>() };
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return state.wide;
    },
    addEventListener: (_: string, fn: () => void) => state.listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => state.listeners.delete(fn),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  const flip = (wide: boolean) => {
    state.wide = wide;
    act(() => state.listeners.forEach((fn) => fn()));
  };
  return { matchMedia, flip, state };
}

describe('useMediaQuery', () => {
  it('asks the browser once per query, however many readers and renders', () => {
    const { matchMedia, flip, state } = browser();
    const one = renderHook(() => useMediaQuery('(min-width: 1200px)'));
    const two = renderHook(() => useMediaQuery('(min-width: 1200px)'));
    one.rerender();
    two.rerender();
    expect(one.result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledTimes(1);

    flip(true);
    expect(one.result.current).toBe(true);
    expect(two.result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(1);

    one.unmount();
    two.unmount();
    expect(state.listeners.size).toBe(0);
  });

  it('starts over when matchMedia itself is replaced', () => {
    const first = browser();
    renderHook(() => useMediaQuery('(min-width: 640px)')).unmount();
    const second = browser();
    second.state.wide = true;
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'));
    expect(result.current).toBe(true);
    expect(second.matchMedia).toHaveBeenCalledTimes(1);
    expect(first.matchMedia).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { lazy, Suspense, type ComponentType } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mount = vi.hoisted(() => ({ calls: [] as HTMLElement[], destroy: vi.fn(), fail: false }));
vi.mock('@/lib/mascots/landing/stage', () => ({
  mountLandingStage: (_win: Window, layer: HTMLElement) => {
    mount.calls.push(layer);
    if (mount.fail) throw new Error('the stage could not start');
    return { destroy: mount.destroy };
  },
}));
// next/dynamic as Next 15 builds it without SSR: React.lazy in Suspense, no error boundary of its own — a chunk that
// fails to load (a deploy while the page was open, a dropped connection) throws into the tree
const chunk = vi.hoisted(() => ({ fail: false }));
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<{ default: ComponentType }>) => {
    const C = lazy(() => (chunk.fail ? Promise.reject(new Error('ChunkLoadError: Loading chunk failed')) : load()));
    return function Dynamic() {
      return (
        <Suspense fallback={null}>
          <C />
        </Suspense>
      );
    };
  },
}));

import { LandingStage, wantsStage, whenIdle } from './LandingStage';

/** The browser's idle callbacks, held until the test lets them run. */
let idle: (() => void)[] = [];
const win = window as unknown as Record<'requestIdleCallback' | 'cancelIdleCallback', unknown>;
const nav = navigator as Navigator & { connection?: unknown };

beforeEach(() => {
  idle = [];
  mount.calls = [];
  mount.fail = false;
  chunk.fail = false;
  mount.destroy.mockClear();
  win.requestIdleCallback = (fn: () => void) => idle.push(fn);
  win.cancelIdleCallback = () => {};
});
afterEach(() => {
  delete win.requestIdleCallback;
  delete win.cancelIdleCallback;
  delete nav.connection;
});

const layer = () => document.body.querySelector<HTMLElement>('[data-landing-stage]');

describe('LandingStage', () => {
  it('adds nothing to the page until the browser is idle, then a layer hidden from assistive tech, the stage on it', async () => {
    render(<LandingStage />);
    expect(layer()).toBeNull();
    expect(mount.calls).toHaveLength(0);
    await act(async () => idle.forEach(fn => fn()));
    await waitFor(() => expect(layer()).not.toBeNull());
    const el = layer() as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.parentElement).toBe(document.body);   // the page itself is its frame
    expect(el.querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(mount.calls).toEqual([el]);
  });

  it('cleans up on unmount: the stage destroyed, the layer gone', async () => {
    const { unmount } = render(<LandingStage />);
    await act(async () => idle.forEach(fn => fn()));
    await waitFor(() => expect(mount.calls).toHaveLength(1));
    unmount();
    expect(mount.destroy).toHaveBeenCalledTimes(1);
    expect(layer()).toBeNull();
  });

  it('never loads for a browser that asks to save data', async () => {
    nav.connection = { saveData: true };
    expect(wantsStage(navigator)).toBe(false);
    render(<LandingStage />);
    await act(async () => idle.forEach(fn => fn()));
    expect(idle).toHaveLength(0);
    expect(layer()).toBeNull();
    expect(mount.calls).toHaveLength(0);
  });

  it('waits for the page to load, but not for a resource that never finishes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });   // the idle callbacks stay the test's own
    const ready = Object.getOwnPropertyDescriptor(document, 'readyState');
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'interactive' });
    try {
      const ran = vi.fn();
      whenIdle(window, ran, { loadWait: 5000 });
      vi.advanceTimersByTime(4900);
      expect(idle).toHaveLength(0);   // still loading: nothing asked of the browser yet
      vi.advanceTimersByTime(200);
      expect(idle).toHaveLength(1);   // no load after 5 s: idle is asked for all the same
      idle[0]();
      expect(ran).toHaveBeenCalledTimes(1);
      const early = vi.fn();
      whenIdle(window, early, { loadWait: 5000 });
      window.dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(6000);
      expect(idle).toHaveLength(2);   // the load, once — the cap then asks nothing more
    } finally {
      if (ready) Object.defineProperty(document, 'readyState', ready);
      else delete (document as unknown as Record<string, unknown>).readyState;
      vi.useRealTimers();
    }
  });

  it('cancels a start still waiting for idle when the page goes first', async () => {
    const { unmount } = render(<LandingStage />);
    unmount();
    await act(async () => idle.forEach(fn => fn()));
    expect(layer()).toBeNull();
    expect(mount.calls).toHaveLength(0);
  });

  it('leaves the page as it is when the stage’s chunk fails to load', async () => {
    chunk.fail = true;
    vi.resetModules();   // a page that never loaded the chunk yet (the lazy component remembers its first load)
    const { LandingStage: Fresh } = await import('./LandingStage');
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = render(
        <main>
          <h1>讓生命影響生命</h1>
          <Fresh />
        </main>,
      );
      await act(async () => idle.forEach(fn => fn()));
      await act(async () => new Promise(r => setTimeout(r, 0)));
      expect(container.querySelector('h1')?.textContent).toBe('讓生命影響生命');   // the page, not an error page
      expect(layer()).toBeNull();
      expect(mount.calls).toHaveLength(0);
    } finally {
      quiet.mockRestore();
      warn.mockRestore();
    }
  });

  it('leaves the page as it is when the stage fails as it starts', async () => {
    mount.fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = render(
        <main>
          <h1>讓生命影響生命</h1>
          <LandingStage />
        </main>,
      );
      await act(async () => idle.forEach(fn => fn()));
      await waitFor(() => expect(mount.calls).toHaveLength(1));
      expect(container.querySelector('h1')?.textContent).toBe('讓生命影響生命');
      expect(mount.destroy).not.toHaveBeenCalled();   // there was nothing to destroy
    } finally {
      warn.mockRestore();
    }
  });
});

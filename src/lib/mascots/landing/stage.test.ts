// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CastEntry, StageApi, StageEnv, StageOptions } from '../types';
import { installLanding } from './landingFixture';
import { HEADER_CLEAR, mountLandingStage, type LandingStageHandle } from './stage';

/** The window's media, as the test sets it: its width, the system's scheme and motion preference. */
const media = { width: 1440, dark: false, reduced: false };
const lists = new Set<{ query: string; fire: () => void }>();
function answer(query: string): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query);
  if (min) return media.width >= Number(min[1]);
  if (query.includes('prefers-color-scheme: dark')) return media.dark;
  if (query.includes('prefers-reduced-motion: reduce')) return media.reduced;
  return false;
}
function matchMedia(query: string) {
  const listeners = new Set<() => void>();
  const mql = {
    media: query,
    get matches() {
      return answer(query);
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  lists.add({ query, fire: () => listeners.forEach(fn => fn()) });
  return mql as unknown as MediaQueryList;
}
/** The media changed: every list whose query mentions `what` tells its listeners. */
const changed = (what: string) => [...lists].filter(l => l.query.includes(what)).forEach(l => l.fire());

interface FakeStage {
  api: StageApi;
  env: StageEnv;
  options?: Partial<StageOptions>;
  calls: string[];
}

let stages: FakeStage[] = [];
function createStage(env: StageEnv, _cast: readonly CastEntry[], options?: Partial<StageOptions>): StageApi {
  const calls: string[] = [];
  const api = {
    setTheme: vi.fn((t: string) => calls.push(`theme:${t}`)),
    setReducedMotion: vi.fn((r: boolean) => calls.push(`reduced:${r}`)),
    destroy: vi.fn(() => calls.push('destroy')),
    visitors: () => [],
  } as unknown as StageApi;
  stages.push({ api, env, options, calls });
  return api;
}

let handle: LandingStageHandle | null = null;
let restore: (() => void) | null = null;
const savedMatchMedia = window.matchMedia;
const savedInner = Object.getOwnPropertyDescriptor(window, 'innerHeight');

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(media, { width: 1440, dark: false, reduced: false });
  lists.clear();
  stages = [];
  window.matchMedia = matchMedia;
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 });
});
afterEach(() => {
  handle?.destroy();
  handle = null;
  restore?.();
  restore = null;
  window.matchMedia = savedMatchMedia;
  if (savedInner) Object.defineProperty(window, 'innerHeight', savedInner);
  document.documentElement.removeAttribute('data-scheme');
  vi.useRealTimers();
});

function mount() {
  const page = installLanding('desktop');
  restore = page.restore;
  handle = mountLandingStage(window, page.layer, { createStage, cast: [], settle: 100 });
  return page;
}
const current = () => stages[stages.length - 1];

describe('mountLandingStage', () => {
  it('builds a stage over the measured page: its places, the desktop’s size, the page’s height on the layer', () => {
    const page = mount();
    expect(stages).toHaveLength(1);
    const { env } = current();
    expect(env.layer).toBe(page.layer);
    expect(env.unitHeight).toBe(120);
    const ledges = typeof env.ledges === 'function' ? env.ledges() : env.ledges;
    expect(ledges?.map(l => l.id)).toContain('qr-point');
    expect(page.layer.style.height).toBe(`${page.geometry.footer[1] + page.geometry.footer[3]}px`);
  });

  it('shows the engine only the page below the fixed header, following the scroll without measuring', () => {
    const page = mount();
    const { env } = current();
    const top = 82 + HEADER_CLEAR;
    expect(env.viewport()).toEqual({ x: 0, y: top, w: 1440, h: 900 - top });
    page.scrollTo(1300);
    window.dispatchEvent(new Event('scroll'));
    expect(env.viewport()).toEqual({ x: 0, y: 1300 + top, w: 1440, h: 900 - top });
  });

  it('follows the page’s scheme live: the reader’s choice on <html>, else the system’s', async () => {
    mount();
    const { env, calls } = current();
    expect(env.theme).toBe('light');
    document.documentElement.setAttribute('data-scheme', 'dark');
    await Promise.resolve();   // the attribute's observer
    expect(calls).toContain('theme:dark');
    document.documentElement.removeAttribute('data-scheme');
    await Promise.resolve();
    expect(calls[calls.length - 1]).toBe('theme:light');
    media.dark = true;
    changed('prefers-color-scheme');
    expect(calls[calls.length - 1]).toBe('theme:dark');
  });

  it('follows reduced motion live', () => {
    media.reduced = true;
    mount();
    expect(current().env.reducedMotion).toBe(true);
    media.reduced = false;
    changed('prefers-reduced-motion');
    expect(current().calls).toContain('reduced:false');
  });

  it('switches presets when the width changes live: the visitors go at once, a new stage comes when it settles', () => {
    mount();
    const first = current();
    media.width = 390;
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 390 });
    window.dispatchEvent(new Event('resize'));
    expect(first.calls).toContain('destroy');
    expect(stages).toHaveLength(1);
    vi.advanceTimersByTime(150);
    expect(stages).toHaveLength(2);
    expect(current().env.unitHeight).toBe(80);
    expect(handle?.preset.name).toBe('phone');
  });

  it('keeps the stage when only the height changes (a phone’s toolbars coming and going)', () => {
    mount();
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 700 });
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);
    expect(stages).toHaveLength(1);
    expect(current().calls).not.toContain('destroy');
    expect(current().env.viewport().h).toBe(700 - 82 - HEADER_CLEAR);
  });

  it('cleans up on destroy: the stage goes, and nothing it listened to reaches it any more', async () => {
    mount();
    const { calls } = current();
    handle?.destroy();
    handle = null;
    expect(calls).toEqual(['destroy']);
    document.documentElement.setAttribute('data-scheme', 'dark');
    await Promise.resolve();
    media.reduced = true;
    changed('prefers-reduced-motion');
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['destroy']);
    expect(stages).toHaveLength(1);
  });

  it('measures again when the page’s size changes, not for the observer’s first report of the size it measured', () => {
    const observers: ((entries: ResizeObserverEntry[]) => void)[] = [];
    const saved = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(fn: (entries: ResizeObserverEntry[]) => void) {
        observers.push(fn);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      mount();
      const first = handle?.layout;
      const report = (w: number, h: number) =>
        observers.forEach(fn => fn([{ borderBoxSize: [{ inlineSize: w, blockSize: h }], contentRect: { width: w, height: h } } as unknown as ResizeObserverEntry]));
      const body = document.body.getBoundingClientRect();
      report(body.width, body.height);   // what it was measured at: nothing to do
      vi.advanceTimersByTime(500);
      expect(handle?.layout).toBe(first);
      report(body.width, body.height + 400);   // the page grew
      vi.advanceTimersByTime(500);
      expect(handle?.layout).not.toBe(first);
      expect(stages).toHaveLength(1);   // nobody's place moved: the same stage, the new places
    } finally {
      window.ResizeObserver = saved;
    }
  });

  it('ends quietly when a later measure fails: said once, its stage gone, nothing listened to any more', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const page = mount();
      const { calls } = current();
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => { throw new Error('gone'); } });
      handle?.measure();
      expect(errors).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(['destroy']);
      expect(page.layer.style.height).toBe('');
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1000);
      expect(stages).toHaveLength(1);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });

  it('throws, leaving nothing behind, when the stage can’t start', () => {
    const page = installLanding('desktop');
    restore = page.restore;
    let tries = 0;
    const failing = () => {
      tries++;
      throw new Error('no stage');
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => mountLandingStage(window, page.layer, { createStage: failing, cast: [], settle: 100 })).toThrow('no stage');
      // nothing left listening: a new width, the page growing, fonts — no second try, no error
      media.width = 390;
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 390 });
      changed('min-width');
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1000);
      expect(tries).toBe(1);
      expect(errors).not.toHaveBeenCalled();
      expect(page.layer.style.height).toBe('');
    } finally {
      errors.mockRestore();
    }
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { centerRow, useThreadScroll } from './useThreadScroll';

/** A scroller `height` tall over `content` of rows, and a row `rowTop` down the content, 40 tall. */
function thread({ height = 600, content = 20_000, at = 19_400, rowTop }: { height?: number; content?: number; at?: number; rowTop: number }) {
  const scroller = document.createElement('div');
  const row = document.createElement('div');
  scroller.appendChild(row);
  let top = at;
  Object.defineProperties(scroller, {
    clientHeight: { value: height },
    scrollHeight: { value: content },
    scrollTop: { get: () => top, set: (v: number) => (top = v) },
  });
  Object.defineProperty(row, 'offsetHeight', { value: 40 });
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  row.getBoundingClientRect = () => ({ top: rowTop - top }) as DOMRect;
  // A glide: where it was asked to go, and where the scroller stood when it was asked.
  const glides: { from: number; to: number }[] = [];
  scroller.scrollTo = ((opts: ScrollToOptions) => glides.push({ from: top, to: opts.top ?? top })) as Element['scrollTo'];
  return { scroller, row, glides, land: (to: number) => ((top = to), scroller.dispatchEvent(new Event('scrollend'))) };
}

afterEach(() => vi.useRealTimers());

describe('centerRow', () => {
  it('covers a long way at once but for the last window, which glides to the row', () => {
    const t = thread({ rowTop: 1_000 });
    void centerRow(t.scroller, t.row);
    // The row's middle at the window's: 1000 - (600 - 40) / 2.
    expect(t.glides).toEqual([{ from: 720 + 600, to: 720 }]);
  });

  it('glides the whole way when it is short', () => {
    const t = thread({ rowTop: 19_000 });
    void centerRow(t.scroller, t.row);
    expect(t.glides).toEqual([{ from: 19_400, to: 18_720 }]);
  });

  it('says it has arrived only when the glide ends at the row, not when the jump before it ends', async () => {
    const t = thread({ rowTop: 1_000 });
    let arrived = false;
    void centerRow(t.scroller, t.row).then(() => (arrived = true));
    // The jump most of the way ends on its own, a moment later.
    t.land(1_320);
    await Promise.resolve();
    expect(arrived).toBe(false);
    t.land(720);
    await Promise.resolve();
    expect(arrived).toBe(true);
  });

  it('gives up waiting for a glide that never says it ended', async () => {
    vi.useFakeTimers();
    const t = thread({ rowTop: 1_000 });
    let arrived = false;
    void centerRow(t.scroller, t.row).then(() => (arrived = true));
    await vi.advanceTimersByTimeAsync(699);
    expect(arrived).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(arrived).toBe(true);
  });

  it('has arrived at once when the row is already in the middle', async () => {
    const t = thread({ rowTop: 19_400 + 280 });
    await expect(centerRow(t.scroller, t.row)).resolves.toBeUndefined();
  });
});

describe('where the browser doesn’t anchor scrolling by itself (Safari)', () => {
  /** Rows 100 tall, the third of them `grow`s; the scroller well up a long thread. */
  function rows() {
    const scroller = document.createElement('div');
    const heights = [100, 100, 100, 100, 100, 100];
    const els = heights.map((_, i) => {
      const row = document.createElement('div');
      row.dataset.messageKey = `m${i}`;
      scroller.appendChild(row);
      return row;
    });
    let top = 250;
    const topOf = (i: number) => heights.slice(0, i).reduce((a, b) => a + b, 0);
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { get: () => heights.reduce((a, b) => a + b, 0) + 5000 },
      scrollTop: { get: () => top, set: (v: number) => (top = v) },
    });
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect;
    els.forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: topOf(i) - top, bottom: topOf(i) + heights[i] - top }) as DOMRect;
    });
    return { scroller, heights, top: () => top };
  }

  it('keeps the row the reader is at in place when one above it changes height', () => {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('CSS', { supports: () => false });
    const t = rows();
    renderHook(() => useThreadScroll({ current: t.scroller }, { firstKey: 'm0', lastKey: 'm5', lastIsOwn: false }));
    // The reader scrolls to the third row (its top half off the window).
    t.scroller.scrollTop = 250;
    act(() => void t.scroller.dispatchEvent(new Event('scroll')));
    // A shared card's stand-in above becomes the card, 60 shorter.
    t.heights[1] = 40;
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(t.top()).toBe(190);
    vi.unstubAllGlobals();
  });
});

describe('taken up the thread', () => {
  // A glide to a note, a quote's original or a match starts at the bottom: a card arriving below meanwhile
  // must not pull the reader back down to it.
  it('lets go of the bottom while a jump glides away from it', () => {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const scroller = document.createElement('div');
    let top = 0;
    Object.defineProperties(scroller, {
      clientHeight: { value: 600 },
      scrollHeight: { value: 3000 },
      scrollTop: { get: () => top, set: (v: number) => (top = v) },
    });
    const { result } = renderHook(() => useThreadScroll({ current: scroller }, { firstKey: 'a', lastKey: 'z', lastIsOwn: false }));
    // At the bottom, something below grows: the reader stays at the bottom.
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(top).toBe(3000);

    result.current.leaveBottom();
    top = 1200;
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(top).toBe(1200);
    vi.unstubAllGlobals();
  });
});


describe('the foot growing under a reader at the bottom', () => {
  /**
   * A thread at its bottom, its foot `dock` tall. The scroller clamps as a browser does; the foot's height
   * reaches the body only through `writeDock` (useDockInset's ResizeObserver, `--dock-h`).
   */
  function atBottom() {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const view = 700;
    const rows = 3000;
    let dock = 64; // the foot as drawn
    let written = 64; // the foot as the body knows it (--dock-h)
    const el = document.createElement('div');
    // The body is pulled under the foot by --dock-h; the foot takes its own height from the column: the scroller
    // loses what the foot grew by until --dock-h follows. Its end keeps --dock-h of room under the newest message.
    const clientHeight = () => view - (dock - written);
    const scrollHeight = () => rows + written;
    let top = scrollHeight() - clientHeight();
    Object.defineProperties(el, {
      clientHeight: { get: clientHeight },
      scrollHeight: { get: scrollHeight },
      scrollTop: { get: () => top, set: (v: number) => (top = Math.max(0, Math.min(v, scrollHeight() - clientHeight()))) },
    });
    const below = () => scrollHeight() - top - clientHeight();
    return {
      el,
      below,
      grow: (by: number) => (dock += by),
      // The browser's scroll anchoring moving the view (down) as the scroller shrinks, then its scroll event.
      nudge: (by: number) => {
        el.scrollTop = top + by;
        act(() => void el.dispatchEvent(new Event('scroll')));
      },
      scrollTo: (to: number) => {
        el.scrollTop = to;
        act(() => void el.dispatchEvent(new Event('scroll')));
      },
      writeDock: () => {
        written = dock;
        act(() => observed.forEach((cb) => cb([], {} as ResizeObserver)));
      },
    };
  }

  afterEach(() => vi.unstubAllGlobals());

  // The sticker panel opening on a phone with the field unfocused: ~298 of foot at once, the browser's anchoring
  // nudging the view 17 down in the scroll event that runs before the foot's height reaches the body.
  it('keeps the reader at the newest message when the browser scrolls before the foot’s height reaches the body', () => {
    const t = atBottom();
    const { result } = renderHook(() => useThreadScroll({ current: t.el }, { firstKey: 'a', lastKey: 'z', lastIsOwn: false }));
    expect(t.below()).toBe(0);
    t.grow(298);
    t.nudge(17);
    t.writeDock();
    expect(t.below()).toBe(0);
    expect(result.current.atBottom).toBe(true);
    // The panel grown taller (↑), then shorter again, the same way.
    t.grow(380);
    t.nudge(20);
    t.writeDock();
    expect(t.below()).toBe(0);
    t.grow(-380);
    t.scrollTo(t.el.scrollTop); // a shorter foot: the scroller's clamp, no move up the thread
    t.writeDock();
    expect(t.below()).toBe(0);
    expect(result.current.atBottom).toBe(true);
  });

  it('still lets the reader leave the bottom by scrolling up the thread', () => {
    const t = atBottom();
    const { result } = renderHook(() => useThreadScroll({ current: t.el }, { firstKey: 'a', lastKey: 'z', lastIsOwn: false }));
    t.scrollTo(t.el.scrollTop - 300);
    expect(result.current.atBottom).toBe(false);
    // Something below grows meanwhile: they aren't pulled back down.
    t.grow(298);
    t.writeDock();
    expect(t.below()).toBeGreaterThan(80);
  });
});

describe('a stretch drawn further up', () => {
  // Gone to a message far back, the thread draws a stretch around it: its foot isn't the bottom.
  function scroller(at: number) {
    const el = document.createElement('div');
    let top = at;
    Object.defineProperties(el, {
      clientHeight: { value: 600 },
      scrollHeight: { value: 3000 },
      scrollTop: { get: () => top, set: (v: number) => (top = v) },
    });
    return {
      el,
      top: () => top,
      move: (to: number) => {
        top = to;
        act(() => void el.dispatchEvent(new Event('scroll')));
      },
    };
  }

  it('follows nothing at its foot, holds no one there, and asks for the next newer page near it', () => {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const s = scroller(1200);
    const onNearBottom = vi.fn();
    const { result, rerender } = renderHook((props: { lastKey: string; tail: boolean }) =>
      useThreadScroll({ current: s.el }, { firstKey: 'a', lastKey: props.lastKey, lastIsOwn: false, tail: props.tail, onNearBottom }),
    { initialProps: { lastKey: 'm', tail: false } });

    // At its foot, the reader isn't "at the bottom": what grows there doesn't pull them down.
    s.move(2400);
    expect(result.current.atBottom).toBe(false);
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(s.top()).toBe(2400);
    // Near it, the next page is asked for.
    expect(onNearBottom).toHaveBeenCalled();

    // A page more drawn under it moves nothing, and isn't news.
    rerender({ lastKey: 'n', tail: false });
    expect(s.top()).toBe(2400);
    expect(result.current.newBelow).toBe(false);
    vi.unstubAllGlobals();
  });

  it('never asks for a newer page at the newest message', () => {
    const s = scroller(1200);
    const onNearBottom = vi.fn();
    renderHook(() => useThreadScroll({ current: s.el }, { firstKey: 'a', lastKey: 'z', lastIsOwn: false, onNearBottom }));
    s.move(2400);
    expect(onNearBottom).not.toHaveBeenCalled();
  });
});

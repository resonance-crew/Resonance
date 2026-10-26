// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { resetElementSizeObserverForTests, useElementSize } from './useElementSize';

// Every organic shape measures its box with this hook (hundreds of them in a
// feed or a thread): one shared observer, and a render only when the size
// it reports is new.

/** What the shared observer watches now. */
let watching: Set<Element>;
let report: ResizeObserverCallback | null;
let made: number;

beforeEach(() => {
  resetElementSizeObserverForTests();
  watching = new Set();
  report = null;
  made = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        made++;
        report = cb;
      }
      observe(el: Element) {
        watching.add(el);
      }
      unobserve(el: Element) {
        watching.delete(el);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetElementSizeObserverForTests();
});

/** Sets the box the browser would lay `el` out at. */
function size(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: h });
}

/** Fires the shared observer for these elements, as the browser does after a layout. */
function tick(...els: Element[]) {
  act(() => report!(els.map((target) => ({ target }) as ResizeObserverEntry), {} as ResizeObserver));
}

/** Commits of each box (a render React throws away before committing doesn't count). */
const renders: Record<string, number> = {};
const seen: Record<string, { w: number; h: number; measured: boolean }> = {};

function Box({ id, w, h }: { id: string; w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (el) size(el, w, h);
  };
  const dims = useElementSize(ref);
  useLayoutEffect(() => {
    renders[id] = (renders[id] ?? 0) + 1;
    seen[id] = dims;
  });
  return <div data-testid={id} ref={callback} />;
}

describe('useElementSize', () => {
  beforeEach(() => {
    for (const k of Object.keys(renders)) delete renders[k];
  });

  it('measures before paint, and the observer’s first report of the same size costs no render', () => {
    const { getByTestId } = render(<Box id="a" w={120} h={40} />);
    expect(seen.a).toEqual({ w: 120, h: 40, measured: true });
    // The first render, then the layout-phase measurement.
    expect(renders.a).toBe(2);

    tick(getByTestId('a'));
    expect(renders.a).toBe(2);
  });

  it('renders again only when the size really changed', () => {
    const { getByTestId } = render(<Box id="a" w={120} h={40} />);
    const el = getByTestId('a');

    size(el, 120, 40);
    tick(el);
    expect(renders.a).toBe(2);

    size(el, 200, 40);
    tick(el);
    expect(seen.a).toEqual({ w: 200, h: 40, measured: true });
    expect(renders.a).toBe(3);
  });

  it('watches every element through one observer, and lets each go when it unmounts', () => {
    const { getByTestId, rerender } = render(
      <>
        <Box id="a" w={10} h={10} />
        <Box id="b" w={20} h={20} />
      </>,
    );
    const a = getByTestId('a');
    const b = getByTestId('b');
    expect(made).toBe(1);
    expect([...watching]).toEqual([a, b]);

    // A report for one element reaches that element's hook alone.
    size(b, 30, 20);
    tick(b);
    expect(seen.b).toEqual({ w: 30, h: 20, measured: true });
    expect(renders.a).toBe(2);

    rerender(<Box id="a" w={10} h={10} />);
    expect([...watching]).toEqual([a]);
    expect(made).toBe(1);
  });

  it('two hooks measuring one element share its observation', () => {
    function Twice() {
      const ref = useRef<HTMLDivElement>(null);
      const one = useElementSize(ref);
      const two = useElementSize(ref);
      seen.one = one;
      seen.two = two;
      return (
        <div
          data-testid="twice"
          ref={(el) => {
            ref.current = el;
            if (el) size(el, 50, 60);
          }}
        />
      );
    }
    const { getByTestId, unmount } = render(<Twice />);
    const el = getByTestId('twice');
    expect([...watching]).toEqual([el]);
    size(el, 70, 60);
    tick(el);
    expect(seen.one).toEqual({ w: 70, h: 60, measured: true });
    expect(seen.two).toEqual({ w: 70, h: 60, measured: true });
    unmount();
    expect(watching.size).toBe(0);
  });
});

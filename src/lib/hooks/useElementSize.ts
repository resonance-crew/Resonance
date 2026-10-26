'use client';

import { RefObject, useEffect, useLayoutEffect, useState } from 'react';

// useLayoutEffect emits a warning when run on the server, so fall back to the
// no-op useEffect path there. On the client we want layout-phase measurement
// so the real size is committed *before* the browser paints — this avoids the
// organic shapes flashing at a wrong default size while we wait for an effect.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ElementSize {
  w: number;
  h: number;
  /** False until the element has been measured in the browser. */
  measured: boolean;
}

/**
 * One ResizeObserver for every measured element on the page (there are
 * hundreds in a long thread or feed): each element's listeners, called with
 * its entries. Made on first use, in the browser only.
 */
let shared: ResizeObserver | null = null;
const listeners = new Map<Element, Set<() => void>>();

function observe(el: Element, onResize: () => void): () => void {
  shared ??= new ResizeObserver((entries) => {
    for (const entry of entries) listeners.get(entry.target)?.forEach((fn) => fn());
  });
  let set = listeners.get(el);
  if (!set) {
    set = new Set();
    listeners.set(el, set);
    shared.observe(el);
  }
  set.add(onResize);
  const observer = shared;
  return () => {
    set.delete(onResize);
    if (set.size || listeners.get(el) !== set) return;
    listeners.delete(el);
    observer.unobserve(el);
  };
}

/**
 * Measures an element and keeps the size in sync via ResizeObserver.
 *
 * Starts at 0×0 (never a guessed default) so shape generators that gate on
 * `w && h` render nothing until the real size is known — the SVG then appears
 * already at the correct geometry instead of resizing in front of the user.
 * The trailing numeric args are accepted for call-site compatibility but no
 * longer seed an initial size.
 *
 * A measurement that finds the size it already has changes nothing, so the
 * observer's first report (right after the layout-phase read) and any tick
 * that leaves the rounded size as it was cost no render.
 */
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  _legacyDefaultW = 0,
  _legacyDefaultH = 0,
  deps: unknown[] = []
): ElementSize {
  const [dims, setDims] = useState<ElementSize>({ w: 0, h: 0, measured: false });
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const node = ref.current;
      if (!node) return;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      setDims((prev) => (prev.measured && prev.w === w && prev.h === h ? prev : { w, h, measured: true }));
    };
    const stop = observe(el, update);
    update();
    return stop;

  }, [ref.current, ...deps]);
  return dims;
}

/** Forget the shared observer (tests that swap ResizeObserver out). */
export function resetElementSizeObserverForTests(): void {
  shared?.disconnect();
  shared = null;
  listeners.clear();
}

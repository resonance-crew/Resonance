'use client';

import { useSyncExternalStore } from 'react';

/**
 * One MediaQueryList per query, made on first use: the snapshot is read on
 * every render of every reader, and matchMedia parses its query each call.
 * Made again if window.matchMedia itself is replaced (tests stub it).
 */
let lists = new Map<string, MediaQueryList>();
let madeBy: typeof window.matchMedia | null = null;

function listFor(query: string): MediaQueryList {
  if (madeBy !== window.matchMedia) {
    madeBy = window.matchMedia;
    lists = new Map();
  }
  let mq = lists.get(query);
  if (!mq) {
    mq = window.matchMedia(query);
    lists.set(query, mq);
  }
  return mq;
}

/**
 * Whether a media query matches — `null` until it can be known (the server
 * render and hydration). Unlike {@link useIsMobile}, whose `false` before the
 * first effect is indistinguishable from "wide", this lets a caller wait
 * rather than mount what a phone doesn't need (and then throw it away).
 * Layout that CSS can decide belongs in a media query instead.
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const mq = listFor(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => listFor(query).matches,
    () => null,
  );
}

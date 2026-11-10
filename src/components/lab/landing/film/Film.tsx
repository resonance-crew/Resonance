'use client';

/**
 * The film's runtime (SPEC §9, §10). The inline script (Page.tsx) has already set the film before the first paint;
 * here, right after hydration, its runtime is loaded (`import()`, not on idle: visitors scroll early). There is one
 * page and one behaviour (round 4: the picture book is gone): the film, whoever comes — a reduced-motion reader too
 * (nothing then moves until ▶ is pressed: runtime/index.ts), Save-Data too (the film is the page's own HTML and a few
 * small pictures). Only a short landscape window, which has no room for the stage, and a runtime that failed to load
 * show the opening still (`book`), with a way to try again. Renders nothing of its own.
 */
import { useEffect, useRef } from 'react';
import type { FilmModel } from './model';
import { watchStills } from './whole';
import './runtime/nav';

/**
 * The runtime's chunk, asked for as this module loads — while React is still hydrating the page — not once the effect
 * below runs after it: on a phone that is a few hundred ms of the film's start. (Not in a short landscape window,
 * which shows the opening still; a failed fetch is tried again by `start`.)
 */
let early: Promise<typeof import('./runtime')> | null = null;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(max-height: 500px)').matches) {
  early = import('./runtime');
  early.catch(() => {
    early = null;
  });
}

/**
 * The inline script's decision (Page.tsx MODE_SCRIPT), for when it didn't run: a client-side navigation to the page
 * (the way back from a card page) renders it without executing its scripts.
 */
export function decideMode(): 'film' | 'book' {
  return window.matchMedia('(max-height: 500px)').matches ? 'book' : 'film';
}

export function Film({ model }: { model: FilmModel }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('[data-film-root]');
    if (!root) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    let starting = false;
    const short = window.matchMedia('(max-height: 500px)');
    // the stills show whole or not at all (the inline script has watched them already, unless the router drew the page);
    // hydrated now, a lazy still's parts may be asked for all at once (whole.ts)
    const w = window as Window & { __filmHydrated?: boolean; __filmEager?: (() => void)[] };
    w.__filmHydrated = true;
    for (const go of w.__filmEager?.splice(0) ?? []) go();
    watchStills(root);
    if (!root.dataset.film) {
      root.dataset.film = decideMode();
      const q = new URLSearchParams(window.location.search);
      const b = q.get('b');
      if (b === 'kin' || b === 'drawn') root.dataset.b = b;
      if (q.get('depth') === 'blur') root.dataset.depth = 'blur';
    }

    const bookHandle = () => {
      if (!window.__film || !window.__film.ready || root.dataset.film === 'book') {
        window.__film = {
          ready: true,
          segments: () => [],
          seek: () => {},
          play: () => {},
          state: () => ({ s: 0, scene: 1, acting: false, mode: 'book', resting: false, y: 0, owner: 'write', x: 0 }),
          stats: () => ({ frames: 0, p50: 0, p95: 0, long: 0 }),
        };
      }
    };

    const start = () => {
      if (root.dataset.film !== 'film' || stop || starting) return;
      starting = true;
      (early ?? import('./runtime'))
        // the scene changes' style: the film's own, or the lab's `?change=<name>` (fetched only when asked for)
        .then((m) => m.loadChangeStyle(new URLSearchParams(window.location.search).get('change')).then((style) => ({ m, style })))
        .then(({ m, style }) => {
          starting = false;
          if (cancelled || root.dataset.film !== 'film') return;
          stop = m.startFilm(root, { model, style });
        })
        .catch(() => {
          starting = false;
          early = null;
          root.dataset.film = 'book';
          bookHandle();
        });
    };

    if (root.dataset.film === 'film') start();
    else bookHandle();

    const onCmd = (e: Event) => {
      if ((e as CustomEvent<{ cmd: string }>).detail?.cmd !== 'film' || short.matches) return;
      root.dataset.film = 'film';
      start();
    };
    window.addEventListener('film:cmd', onCmd);
    // a phone turned to landscape gets the still; turned back, the film again (only when it was the turn that took it)
    let bookedForShort = false;
    const onShort = () => {
      if (short.matches && root.dataset.film === 'film') {
        stop?.();
        stop = undefined;
        root.dataset.film = 'book';
        bookedForShort = true;
        bookHandle();
      } else if (!short.matches && bookedForShort && root.dataset.film === 'book') {
        bookedForShort = false;
        root.dataset.film = 'film';
        start();
      }
    };
    short.addEventListener('change', onShort);

    return () => {
      cancelled = true;
      window.removeEventListener('film:cmd', onCmd);
      short.removeEventListener('change', onShort);
      stop?.();
    };
  }, [model]);

  return <span ref={ref} hidden />;
}

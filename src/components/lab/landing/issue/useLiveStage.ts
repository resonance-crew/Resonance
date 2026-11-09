'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { wantsStage, whenIdle } from '@/components/sections/LandingStage/LandingStage';
import type { CastEntry, StageApi, StageEnv, StageOptions } from '@/lib/mascots/types';
import type { LiveHandle, mountLive as MountLive, leaningDice as LeaningDice, nudge as Nudge } from './liveStage';
import { isResting, onRest } from './rest';

export interface StageKit {
  createStage: (env: StageEnv, cast: readonly CastEntry[], options?: Partial<StageOptions>) => StageApi;
  cast: readonly CastEntry[];
  mountLive: typeof MountLive;
  leaningDice: typeof LeaningDice;
  nudge: typeof Nudge;
}

/** `staged`: a stage runs (stills give way as their characters come on); `stills`: none is coming. */
export type LiveState = 'waiting' | 'staged' | 'stills';

/**
 * One section's stage: started once the section comes near the view and the browser is idle, never under reduced
 * motion or Save-Data; paused whenever the issue's pals rest (and, by the engine itself, whenever it is out of view).
 * `make` builds it from the kit (the engine, the cast, the issue's stage helpers) or answers null to stay still.
 */
export function useLiveStage(
  ref: RefObject<HTMLElement | null>,
  make: (kit: StageKit, layer: HTMLElement) => LiveHandle | null,
  { approach = '240px', enabled = true }: { approach?: string; enabled?: boolean } = {},
): { state: LiveState; handle: RefObject<LiveHandle | null> } {
  const [state, setState] = useState<LiveState>('waiting');
  const handle = useRef<LiveHandle | null>(null);
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => {
    const layer = ref.current;
    if (!layer || !enabled) return;
    if (!wantsStage(navigator) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState('stills');
      return;
    }
    let gone = false;
    let cancelIdle: (() => void) | null = null;
    let waking: (() => void) | null = null;
    const start = () => {
      // resting already: the stills stay as drawn until the pals are woken, and only then does a stage start
      if (isResting()) {
        waking = onRest(() => {
          if (isResting() || gone) return;
          waking?.();
          waking = null;
          start();
        });
        return;
      }
      cancelIdle = whenIdle(window, () => {
        Promise.all([import('@/lib/mascots'), import('@/lib/mascots/cast.generated'), import('./liveStage')])
          .then(([{ createStage }, { MASCOT_CAST }, live]) => {
            if (gone) return;
            const h = makeRef.current(
              { createStage, cast: MASCOT_CAST, mountLive: live.mountLive, leaningDice: live.leaningDice, nudge: live.nudge },
              layer,
            );
            if (!h) {
              setState('stills');
              return;
            }
            handle.current = h;
            setState('staged');
          })
          .catch((e) => {
            // decoration: the section stays as the server drew it
            if (!gone) setState('stills');
            if (process.env.NODE_ENV === 'development') console.warn('[issue stage] left out', e);
          });
      });
    };
    const near =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            (entries) => {
              if (!entries.some((e) => e.isIntersecting)) return;
              near?.disconnect();
              start();
            },
            { rootMargin: approach },
          )
        : null;
    if (near) near.observe(layer);
    else start();
    const off = onRest(() => {
      const s = handle.current?.stage();
      if (!s) return;
      if (isResting()) s.pause();
      else s.resume();
    });
    return () => {
      gone = true;
      waking?.();
      near?.disconnect();
      cancelIdle?.();
      off();
      handle.current?.destroy();
      handle.current = null;
    };
    // the section's stage is its own for good
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { state, handle };
}

/** Asks for a visit until the stage can place it (the layer laid out, the parts on their way), a few times. */
export function askVisit(win: Window, ask: () => boolean, tries = 14): () => void {
  let timer = 0;
  const go = (n: number) => {
    if (ask() || n >= tries) return;
    timer = win.setTimeout(() => go(n + 1), 350);
  };
  go(0);
  return () => win.clearTimeout(timer);
}

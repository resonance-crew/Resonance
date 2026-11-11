'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { whenIdle } from '@/components/sections/LandingStage/LandingStage';
import type { Ledge, Rect, StageOptions, VisitRequest } from '@/lib/mascots/types';
import { useMotionOk, usePalsRest } from './rest';
import type { LayerStage } from './stages';

/** A section's one character: where its layer lies (the root's px), its places (the layer's px), its first visit. */
export interface SoloBuild {
  box: Rect;
  ledges: Ledge[];
  first: VisitRequest;
}

export interface SoloOptions {
  slug: string;
  /** Measures the section now; null if it can't yet (asked again a moment later). */
  build: (win: Window, root: HTMLElement) => SoloBuild | null;
  /** When it comes: the root this far in view (an IntersectionObserver's margin and threshold). */
  rootMargin?: string;
  threshold?: number;
  pace?: Partial<StageOptions>;
  /** Night whatever the page's scheme (the night band). */
  night?: boolean;
}

/**
 * A section's own little stage, for one character: mounted once the page is idle and the section is in view (or at
 * its cue: `rootMargin`), put away while the puppets rest, never under reduced motion or Save-Data. The engine pauses
 * it while it is out of view. Answers whether its character has come on (its still can go).
 */
export function useSoloStage(ref: RefObject<HTMLElement | null>, opts: SoloOptions): boolean {
  const { resting } = usePalsRest();
  const motionOk = useMotionOk();
  const [live, setLive] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useEffect(() => {
    const root = ref.current;
    if (!root || motionOk !== true || resting) return;
    let gone = false;
    let st: LayerStage | null = null;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    let retry = 0;
    let width = 0;
    const start = async () => {
      const stages = await import('./stages');
      const engine = await stages.loadEngine();
      if (gone) return;
      const o = optsRef.current;
      const mount = (first: boolean, tries = 0) => {
        if (gone) return;
        st?.destroy();
        st = null;
        const b = o.build(window, root);
        if (!b) {
          if (tries < 10) retry = window.setTimeout(() => mount(first, tries + 1), 300);
          return;
        }
        width = Math.round(root.getBoundingClientRect().width);
        try {
          st = stages.layerStage(window, root, {
            engine,
            slugs: [o.slug],
            box: b.box,
            unit: stages.unitOf(window, root),
            ledges: () => b.ledges,
            pace: { ...stages.STAY, ...o.pace },
            theme: o.night ? 'dark' : undefined,
            onEvent: (e) => {
              if (e.type === 'enter') setLive(true);
            },
          });
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn(`[${o.slug}] left out`, e);
          return;
        }
        const ask = (n = 0) => {
          if (!st || gone) return;
          const ok = st.stage.visit(first ? b.first : { ledge: b.first.ledge, slug: o.slug });
          if (!ok && n < 10) retry = window.setTimeout(() => ask(n + 1), 300);
        };
        ask();
      };
      mount(true);
      ro = new ResizeObserver(() => {
        const w = Math.round(root.getBoundingClientRect().width);
        if (w !== width) mount(false);
      });
      ro.observe(root);
    };
    const cancel = whenIdle(window, () => {
      if (gone) return;
      io = new IntersectionObserver(
        (es) => {
          if (!es.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          io = null;
          start().catch((e) => {
            if (process.env.NODE_ENV === 'development') console.warn(`[${optsRef.current.slug}] left out`, e);
          });
        },
        { rootMargin: optsRef.current.rootMargin ?? '0px', threshold: optsRef.current.threshold ?? 0.5 },
      );
      io.observe(root);
    });
    return () => {
      gone = true;
      cancel();
      window.clearTimeout(retry);
      io?.disconnect();
      ro?.disconnect();
      st?.destroy();
      setLive(false);
    };
  }, [ref, resting, motionOk]);
  return live;
}

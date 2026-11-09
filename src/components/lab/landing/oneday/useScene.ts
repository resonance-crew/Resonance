'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { wantsStage, whenIdle } from '@/components/sections/LandingStage/LandingStage';
import type { SceneGeom, SceneHandle, ScenePart } from './scene';

import { isResting, onRestChange } from './rest';

export interface SceneConfig<G extends SceneGeom> {
  measure: (root: HTMLElement) => G | null;
  parts: readonly ScenePart<G>[];
  threshold?: number;
}

export interface SceneState {
  /** A stage is coming (the stills wait unseen until each one's character comes on), or none is (they show). */
  staged: 'staged' | 'stills' | null;
  /** Who has come on stage (their stills can go). */
  live: ReadonlySet<string>;
}

/**
 * A section's scene, alive once the page is up and the browser idle — never under reduced motion or Save-Data, and
 * if the engine's chunk fails to load or the scene to start, the stills simply stay. Mounted only while the section is
 * in view and taken down once it has gone, so no more than one or two scenes run at once; coming back, its puppets
 * come on again. Out of view the stills stand where the server drew them, so the page seen whole is never empty. The page's rest switch takes it down (the stills stand in) and brings it back.
 */
export function useScene<G extends SceneGeom>(
  ref: RefObject<HTMLElement | null>,
  config: () => Promise<SceneConfig<G>>,
  onHandle?: (h: SceneHandle<G> | null) => void,
): SceneState {
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());
  const [staged, setStaged] = useState<SceneState['staged']>(null);
  const cfg = useRef(config);
  cfg.current = config;
  const handleCb = useRef(onHandle);
  handleCb.current = onHandle;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!wantsStage(navigator) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStaged('stills');
      return;
    }
    let gone = false;
    let handle: SceneHandle<G> | null = null;
    let mods: {
      createStage: typeof import('@/lib/mascots').createStage;
      cast: typeof import('@/lib/mascots/cast.generated').MASCOT_CAST;
      mountScene: typeof import('./scene').mountScene;
      config: SceneConfig<G>;
    } | null = null;
    let near = false;

    const mount = () => {
      if (handle || !mods || gone || !near || isResting()) return;
      try {
        const c = mods.config;
        handle = mods.mountScene<G>(window, root, {
          createStage: mods.createStage,
          cast: mods.cast,
          measure: c.measure,
          parts: c.parts,
          threshold: c.threshold,
          onEnter: (slug) => setLive((s) => new Set(s).add(slug)),
        });
        handleCb.current?.(handle);
      } catch (e) {
        handle = null;
        if (process.env.NODE_ENV === 'development') console.warn('[oneday scene] left out', e);
      }
    };
    const unmount = () => {
      if (!handle) return;
      handle.destroy();
      handle = null;
      handleCb.current?.(null);
      setLive(new Set());
    };
    // near and awake: the stage runs and the stills wait for their characters; far (or resting): the stills stand
    // where the server drew them (a page seen whole, a fast scroll, a stage that failed)
    const sync = () => {
      if (near && !isResting()) mount();
      else unmount();
      setStaged(handle ? 'staged' : 'stills');
    };
    const sight = new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting);
        sync();
      },
      // in view (a hair inside it): the stills stand until then, and whatever is still off-screen when its stage
      // starts is where its character will walk in
      { rootMargin: '-1% 0px -1% 0px' },
    );
    const cancel = whenIdle(window, () => {
      Promise.all([import('@/lib/mascots'), import('@/lib/mascots/cast.generated'), import('./scene'), cfg.current()])
        .then(([m, c, s, config]) => {
          if (gone) return;
          mods = { createStage: m.createStage, cast: c.MASCOT_CAST, mountScene: s.mountScene, config };
          sight.observe(root);
        })
        .catch((e) => {
          if (!gone) setStaged('stills');
          if (process.env.NODE_ENV === 'development') console.warn('[oneday scene] left out', e);
        });
    });
    // resting: the scene is taken down and its puppets stand still where the server drew them; awake, it comes back
    const offRest = onRestChange(() => mods && sync());
    return () => {
      gone = true;
      cancel();
      sight.disconnect();
      offRest();
      handle?.destroy();
      handle = null;
    };
    // the scene is the section's for good
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { staged, live };
}

/** The attributes a scene's root wears: whether a stage is coming, for the stills' CSS. */
export function stagedAttrs(s: SceneState): Record<string, string | undefined> {
  return {
    'data-staged': s.staged === 'staged' ? '' : undefined,
    'data-stills': s.staged === 'stills' ? '' : undefined,
  };
}

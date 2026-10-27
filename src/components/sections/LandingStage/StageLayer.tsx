'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createStage } from '@/lib/mascots';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { mountLandingStage, type LandingStageHandle } from '@/lib/mascots/landing/stage';
import type { StageEvent } from '@/lib/mascots';
import styles from './LandingStage.module.css';

declare global {
  interface Window {
    /** Development builds only: the landing stage, for poking at it from devtools, and its latest 500 events. */
    __landingStage?: LandingStageHandle;
    __landingStageEvents?: StageEvent[];
  }
}

/**
 * The stage's layer, a child of `<body>` so the page itself is its frame (page px, from the top left), and the stage
 * over it. Loaded only after the landing page has painted and the browser is idle (LandingStage): this module brings
 * the engine and the cast with it. A stage that can't start leaves the empty layer and nothing else.
 */
export default function StageLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const dev = process.env.NODE_ENV === 'development';
    const onEvent = dev
      ? (e: StageEvent) => {
          const log = (window.__landingStageEvents ??= []);
          log.push(e);
          if (log.length > 500) log.shift();
        }
      : undefined;
    let handle: LandingStageHandle;
    try {
      handle = mountLandingStage(window, layer, { createStage, cast: MASCOT_CAST, onEvent });
    } catch (e) {
      // decoration: the page goes on without it (said in development, where someone can look)
      if (dev) console.warn('[landing stage] did not start', e);
      return;
    }
    if (dev) window.__landingStage = handle;
    return () => {
      handle.destroy();
      if (window.__landingStage === handle) delete window.__landingStage;
    };
  }, []);
  return createPortal(<div ref={ref} className={styles.layer} aria-hidden="true" data-landing-stage="" />, document.body);
}

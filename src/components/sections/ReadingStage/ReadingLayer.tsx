'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createStage } from '@/lib/mascots';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { mountPageStage, type LandingStageHandle, type PageScene } from '@/lib/mascots/landing/stage';
import { measureReading } from '@/lib/mascots/reading/measure';
import { readingPresetIn, readingPresetQueries, type ReadingPreset } from '@/lib/mascots/reading/presets';
import styles from './ReadingStage.module.css';

declare global {
  interface Window {
    /** Development builds only: the reading stage, for poking at it from devtools (`__readingStage.stage.visit()`). */
    __readingStage?: LandingStageHandle<ReadingPreset>;
  }
}

const READING_SCENE: PageScene<ReadingPreset> = {
  presetIn: readingPresetIn,
  presetQueries: readingPresetQueries,
  measure: measureReading,
};

/**
 * The reading stage's layer, a child of `<body>` (page px, from the top left), and the stage over it — the landing
 * stage's engine and cast over the home feed's or a card page's places. Loaded only once the switch is on and the
 * page is up (ReadingStage).
 */
export default function ReadingLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const dev = process.env.NODE_ENV === 'development';
    let handle: LandingStageHandle<ReadingPreset>;
    try {
      handle = mountPageStage(window, layer, READING_SCENE, { createStage, cast: MASCOT_CAST });
    } catch (e) {
      if (dev) console.warn('[reading stage] did not start', e);
      return;
    }
    if (dev) window.__readingStage = handle;
    return () => {
      handle.destroy();
      if (window.__readingStage === handle) delete window.__readingStage;
    };
  }, []);
  return createPortal(<div ref={ref} className={styles.layer} aria-hidden="true" data-reading-stage="" />, document.body);
}

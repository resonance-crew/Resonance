'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { wantsStage } from '@/components/sections/LandingStage/LandingStage';
import { INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import type { SettingsStageHandle } from '@/lib/mascots/reading/settingsStage';
import styles from './SettingsClient.module.css';

declare global {
  interface Window {
    /** Development builds only: settings' strip, for poking at it from devtools (`__settingsStage.stage()?.visit()`). */
    __settingsStage?: SettingsStageHandle;
  }
}

/**
 * The strip under the 小精靈 row (round 20, the owner: a puppet in settings, so it is plain what the switch is): a
 * floor drawn in the light pen and a small stage over it — off, one puppet naps there; on, they walk along it, meet
 * and point at the switch, and a click makes one hop (lib/mascots/reading/settingsStage). Decorative: hidden from
 * assistive tech. The engine and cast load with it (this section only), never under Save-Data.
 */
export function MascotsStrip({ on, row }: { on: boolean; /** The row holding the switch it points at. */ row: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<SettingsStageHandle | null>(null);
  const asleep = useRef(!on);
  asleep.current = !on;
  const [shown, setShown] = useState(false);
  const floor = useMemo(() => wavyLine(240, 31, 1.1, 9), []);

  useEffect(() => setShown(wantsStage(navigator)), []);

  useEffect(() => {
    const layer = ref.current;
    if (!shown || !layer) return;
    let gone = false;
    Promise.all([import('@/lib/mascots/reading/settingsStage'), import('@/lib/mascots'), import('@/lib/mascots/cast.generated')])
      .then(([{ mountSettingsStage }, { createStage }, { MASCOT_CAST }]) => {
        if (gone) return;
        handle.current = mountSettingsStage(window, layer, {
          createStage,
          cast: MASCOT_CAST,
          control: () => row.current?.querySelector('[role="switch"]')?.getBoundingClientRect() ?? null,
          asleep: asleep.current,
        });
        if (process.env.NODE_ENV === 'development') window.__settingsStage = handle.current;
      })
      .catch((e) => {
        if (process.env.NODE_ENV === 'development') console.warn('[settings stage] left out', e);
      });
    return () => {
      gone = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [shown, row]);

  useEffect(() => {
    handle.current?.setAsleep(!on);
  }, [on]);

  if (!shown) return null;
  return (
    <div className={styles.strip} aria-hidden="true" data-mascots-strip="">
      <svg className={styles.stripFloor} viewBox="0 -4 240 8" preserveAspectRatio="none">
        <path d={floor} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the stage: the strip and STRIP_HEADROOM over it, for a raised arm */}
      <div ref={ref} className={styles.stripStage} />
    </div>
  );
}

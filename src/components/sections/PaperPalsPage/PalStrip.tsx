'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Divider } from '@/components/atoms/Divider/Divider';
import { wantsStage, whenIdle } from '@/components/sections/LandingStage/LandingStage';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { Still } from '@/lib/mascots/pals/still';
import type { PalStripHandle, StripSpec } from '@/lib/mascots/pals/stage';
import styles from './PaperPalsPage.module.css';

export interface StripStill {
  still: Still;
  /** Where it stands, a fraction of the strip's width. */
  x: number;
  waveArm?: 'l' | 'r';
  phase?: number;
}

/**
 * A little stage: the strip's floor and, as the server draws it, its character(s) standing still on it; once the
 * page is up and the browser idle, the stage takes over (lib/mascots/pals/stage) and the still ones give way to the
 * live one as it comes on. Never under reduced motion or Save-Data, and if the stage's chunk fails to load or the
 * stage to start, the strip simply stays as drawn. Where a stage is coming the still waits unseen (the CSS) until its character comes on. Decoration: the text beside it says who this is.
 */
export function PalStrip({ spec, stills, className }: { spec: StripSpec; stills: StripStill[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  // A stage started (the still stays unseen until its character comes on), or none is coming (it shows).
  const [staged, setStaged] = useState<'staged' | 'stills' | null>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    if (!wantsStage(navigator) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStaged('stills');
      return;
    }
    let handle: PalStripHandle | null = null;
    let gone = false;
    const cancel = whenIdle(window, () => {
      Promise.all([import('@/lib/mascots'), import('@/lib/mascots/cast.generated'), import('@/lib/mascots/pals/stage')])
        .then(([{ createStage }, { MASCOT_CAST }, { mountPalStrip }]) => {
          if (gone) return;
          const night = layer.closest('[data-night]') ? ('dark' as const) : undefined;
          handle = mountPalStrip(window, layer, { createStage, cast: MASCOT_CAST, spec, theme: night, onFirstEnter: () => setLive(true) });
          setStaged('staged');
        })
        .catch((e) => {
          // decoration: the strip stays as the server drew it
          if (!gone) setStaged('stills');
          if (process.env.NODE_ENV === 'development') console.warn('[pals stage] left out', e);
        });
    });
    return () => {
      gone = true;
      cancel();
      handle?.destroy();
    };
    // the spec is the strip's for good (its character, or the meeting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className={[styles.strip, className].filter(Boolean).join(' ')}
      data-live={live ? '' : undefined}
      data-staged={staged === 'staged' ? '' : undefined}
      data-stills={staged === 'stills' ? '' : undefined}
      aria-hidden="true"
    >
      <div className={styles.stripFloor}>
        <Divider seed={spec.kind === 'solo' ? spec.slug.length * 7 + 3 : 41} amplitude={1.5} steps={8} strokeWidth={INK_LIGHT} spacing={0} />
      </div>
      {stills.map((s) => (
        <span key={s.still.slug} className={styles.stripStill} style={{ '--x': s.x } as CSSProperties}>
          <PaperPalStill still={s.still} waveArm={s.waveArm} phase={s.phase} />
        </span>
      ))}
    </div>
  );
}

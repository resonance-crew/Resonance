'use client';

import { useMemo } from 'react';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import styles from './PaperSheet.module.css';

/** A sheet's wobbly outline: what it is filled to, and what a host clips its contents (a row's ink) to. */
export function sheetPath(w: number, h: number, R: number, seed: number): string {
  if (!w || !h) return '';
  return wobRect(w, h, R, seed, autoMag(w, h), {
    segmentsH: autoSegments(w),
    segmentsV: autoSegments(h),
    curve: autoCurve(w, h),
  });
}

export interface PaperSheetProps {
  w: number;
  h: number;
  /** Its corners' radius (a 52-tall tray at 26 is a pill). */
  R?: number;
  seed: number;
}

/**
 * A borderless sheet of paper — what every menu lies on (round 17 §1; the
 * message menu's since round 16 §3): a wobble with no pen line, filled with
 * the sheet's paper (the menu's, at night raised a step, ≈ L 28 %, so it
 * parts from the scrim), the thought map's zoom-cluster grain over the whole
 * filled path (the same path: the wobble swings past the box, and so does the
 * grain), and the paper-cut shadow that follows the wobble (--cutout-shadow). Drawn
 * behind its host's contents, the host's size; nothing until measured.
 */
export function PaperSheet({ w, h, R = 20, seed }: PaperSheetProps) {
  const d = useMemo(() => sheetPath(w, h, R, seed), [w, h, R, seed]);
  if (!d) return null;
  return (
    <span className={styles.sheet} aria-hidden="true">
      <svg className="res-shape-fade-in" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
        <path d={d} fill="var(--sheet-paper)" />
      </svg>
      <ShapeGrain w={w} h={h} d={d} seed={seed} opacity={0.3} frequency={0.88} />
    </span>
  );
}

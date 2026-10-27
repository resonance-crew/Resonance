'use client';

import { useMemo } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import styles from './PaperSheet.module.css';

/** A sheet's wobbly outline: what it is filled to and inked round, and what a host clips its contents (a row's ink) to. */
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
  /**
   * Its pen, when it is not the sheet's own grey (`--sheet-pen`): a Select's
   * open list wears the focus pen, since it is the one thing to look at.
   */
  pen?: string;
}

/**
 * The sheet every menu lies on (round 18, the owner's: flat, as the whole
 * page is): the menu's paper (the theme's own, or a card's for a card's own
 * menu — `--sheet-base`) inside one hand-drawn pen line, the header's quiet
 * grey (`--sheet-pen`) unless its host gives it a colour of its own (a card's
 * menu its card's pen, a Select's list the focus pen). No dividers, no grain,
 * no shadow. Drawn behind its host's contents, the host's size: the paper
 * under a row's ink, the pen over it (the rows above both); nothing until
 * measured.
 */
export function PaperSheet({ w, h, R = 20, seed, pen }: PaperSheetProps) {
  const d = useMemo(() => sheetPath(w, h, R, seed), [w, h, R, seed]);
  if (!d) return null;
  const svg = (layer: 'paper' | 'pen') => (
    <svg className="res-shape-fade-in" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      {layer === 'paper' ? (
        <path d={d} fill="var(--sheet-paper)" />
      ) : (
        <path d={d} fill="none" stroke={pen ?? 'var(--sheet-pen)'} strokeWidth={INK} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
  return (
    <>
      <span className={styles.sheet} aria-hidden="true">
        {svg('paper')}
      </span>
      <span className={styles.pen} aria-hidden="true" data-sheet-pen="">
        {svg('pen')}
      </span>
    </>
  );
}

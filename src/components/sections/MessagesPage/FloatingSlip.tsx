'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './Thread.module.css';

/**
 * How far the page's paper reaches past the pen line of something floating over
 * the thread (the composer's capsule, the slip over it): an outer stroke in the
 * paper's colour under the pen, so it reads as paper cut out and laid over any
 * bubble — a dark photo's too — with no shadow and no alpha.
 */
export const PAPER_HALO = 4;

/** The halo's stroke for a pen of `pen`: the pen's own outer half, then the halo past it. */
export const haloWidth = (pen: number) => pen + 2 * PAPER_HALO;

/** A floating surface's outline at its measured size — the field's wobble (wobAuto), at `radius`. */
export function floatingPath(w: number, h: number, radius: number, seed: number): string {
  if (!w || !h) return '';
  return wobRect(w, h, radius, seed, autoMag(w, h), {
    segmentsH: autoSegments(w),
    segmentsV: autoSegments(h),
    curve: autoCurve(w, h),
  });
}

export interface FloatingSlipProps {
  children: ReactNode;
  seed: number;
  /**
   * `muted`: a secondary surface (what rides with the next message): its pen
   * one step lighter, in the muted ink. `field`: the house pen in the field's
   * ink (a notice standing in the composer's place).
   */
  pen?: 'muted' | 'field';
  className?: string;
  role?: string;
}

/**
 * A slip of the page's paper floating over the thread: opaque cream, the
 * field's wobble at radius 14, its pen line, and the paper halo round it.
 * What the next message carries (the reply's quote, the attached card, note
 * or picture) sits on one directly over the composer; a notice that stands in
 * the composer's place (a letter waiting for its answer) on one of its own.
 * Until it is measured it stands in as a plain rounded shape of the same fill
 * and pen (`.res-shape-stand-in`).
 */
export function FloatingSlip({ children, seed, pen = 'muted', className, role }: FloatingSlipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const d = useMemo(() => floatingPath(w, h, 14, seed), [w, h, seed]);
  const penWidth = pen === 'muted' ? INK_LIGHT : INK;
  return (
    <div
      ref={ref}
      className={[styles.slip, 'res-shape-stand-in', className].filter(Boolean).join(' ')}
      data-pen={pen}
      data-shape-pending={d ? undefined : ''}
      role={role}
      style={{ '--shape-radius': '14px', '--shape-ink-width': `${penWidth}px` } as CSSProperties}
    >
      {d && (
        <svg aria-hidden="true" className={styles.slipShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path d={d} className={styles.paperHalo} strokeWidth={haloWidth(penWidth)} />
          <path d={d} className={styles.paperFill} />
          <path d={d} className={styles.slipPen} strokeWidth={penWidth} />
        </svg>
      )}
      <div className={styles.slipContent}>{children}</div>
    </div>
  );
}

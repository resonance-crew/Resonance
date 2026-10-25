'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './Thread.module.css';

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
  className?: string;
  role?: string;
}

/**
 * A notice standing in the composer's place (a letter waiting for its answer,
 * the way to someone one can't write to, a sending error): opaque cream, the
 * field's wobble at radius 14 in the field's pen, on the foot's paper as the
 * capsule is. Until it is measured it stands in as a plain rounded shape of
 * the same fill and pen (`.res-shape-stand-in`).
 */
export function FloatingSlip({ children, seed, className, role }: FloatingSlipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const d = useMemo(() => floatingPath(w, h, 14, seed), [w, h, seed]);
  return (
    <div
      ref={ref}
      className={[styles.slip, 'res-shape-stand-in', className].filter(Boolean).join(' ')}
      data-shape-pending={d ? undefined : ''}
      role={role}
      style={{ '--shape-radius': '14px', '--shape-ink-width': `${INK}px` } as CSSProperties}
    >
      {d && (
        <svg aria-hidden="true" className={styles.slipShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path d={d} className={styles.paperFill} />
          <path d={d} className={styles.slipPen} strokeWidth={INK} />
        </svg>
      )}
      <div className={styles.slipContent}>{children}</div>
    </div>
  );
}

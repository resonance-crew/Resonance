'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { wobRect } from '@/lib/design/wobRect';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './oneday.module.css';

export interface PaperProps {
  children?: ReactNode;
  seed: number;
  fill: string;
  pen: string;
  /** One of the pen tokens (INK / INK_LIGHT / INK_STRONG). */
  penWidth?: number;
  /** A dashed outline: the card not written yet. */
  dashed?: boolean;
  radius?: number;
  grain?: number;
  className?: string;
  style?: CSSProperties;
  /** Marks the drawn outline (what a puppet behind it is cut along). */
  outline?: string;
  as?: 'div' | 'article' | 'li';
}

/**
 * A sheet of the brand's paper: its own wobbly outline, drawn once measured; until then (the server's HTML) a plain
 * rounded stand-in of the same fill and pen, so nothing jumps. No shadow: what floats is told by its line.
 */
export function Paper({ children, seed, fill, pen, penWidth = INK, dashed, radius = 20, grain = 0.22, className, style, outline, as = 'div' }: PaperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const d = useMemo(
    () => (w > 0 && h > 0 ? wobRect(w, h, radius, seed, Math.min(w, h) * 0.022, { segmentsH: [2, 3], segmentsV: [2, 3], curve: 0.6, cornerJitter: 0.8 }) : ''),
    [w, h, radius, seed],
  );
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      className={`${styles.paper} ${className ?? ''}`}
      style={style}
      data-paper={outline}
    >
      <span
        className="res-shape-stand-in"
        aria-hidden="true"
        data-shape-pending={d ? undefined : ''}
        style={
          {
            position: 'absolute',
            inset: 0,
            '--shape-fill': fill,
            '--shape-ink': dashed ? 'transparent' : pen,
            '--shape-ink-width': `${penWidth}px`,
            '--shape-radius': `${radius}px`,
            outline: dashed && !d ? `${penWidth}px dashed ${pen}` : undefined,
            outlineOffset: dashed && !d ? `-${penWidth}px` : undefined,
            borderRadius: radius,
          } as CSSProperties
        }
      >
        {d && (
          <svg
            className="res-shape-fade-in"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            <path d={d} fill={fill} />
            <path
              d={d}
              fill="none"
              stroke={pen}
              strokeWidth={penWidth}
              strokeLinecap="round"
              strokeDasharray={dashed ? '7 7' : undefined}
              data-outline={outline}
            />
          </svg>
        )}
        {d && grain > 0 && <ShapeGrain w={w} h={h} d={d} seed={seed} opacity={grain} />}
      </span>
      <div style={{ position: 'relative', height: '100%' }}>{children}</div>
    </Tag>
  );
}

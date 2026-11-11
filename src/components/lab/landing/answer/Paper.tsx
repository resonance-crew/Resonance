'use client';

import { forwardRef, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { wobRect } from '@/lib/design/wobRect';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './answer.module.css';

export interface PaperProps {
  seed: number;
  /** The paper's colour, and its pen. */
  fill: string;
  pen: string;
  /** The solid line's pen on a blank page once inked (its own colour, not the dashes'). */
  penInk?: string;
  /** A page not written on yet: its line dashed, and a solid line laid under it (drawn in when answered). */
  blank?: boolean;
  /** Answered: the solid line shows, the dashed one goes (Desk.tsx draws it in with DrawSVG when it can). */
  inked?: boolean;
  /** A colour spreading over the paper from a point (the brush wash). */
  wash?: { color: string; x: number; y: number; on: boolean; duration?: number };
  grain?: number;
  className?: string;
  /** A class for the box the paper's contents are laid in. */
  bodyClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Marks for the stages and the page (data-desk-story…). */
  data?: Record<string, string>;
}

const R = 22;

/**
 * A card's paper, drawn by hand (wobRect): its fill and pen once measured, and until then (the server's HTML, no
 * scripts) a plain rounded stand-in of the same fill and pen — dashed for a blank page. The outline path carries
 * `data-outline`, which the stages read for the card's drawn top.
 */
export const Paper = forwardRef<HTMLDivElement, PaperProps>(function Paper(
  { seed, fill, pen, penInk, blank = false, inked = false, wash, grain = 0.22, className, bodyClassName, style, children, data },
  outer,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { w, h } = useElementSize(ref);
  const d = useMemo(() => {
    if (!w || !h) return '';
    const turns = Math.max(3, Math.round(w / 120));
    return wobRect(w, h, R, seed, Math.min(w, h) * 0.018, {
      segmentsH: [turns, turns + 1],
      segmentsV: [3, 4],
      curve: 0.6,
      cornerJitter: 0.8,
      cornerOffset: 3,
    });
  }, [w, h, seed]);
  const set = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  };
  return (
    <div
      ref={set}
      className={[styles.paper, className].filter(Boolean).join(' ')}
      style={{ ...style, '--paper-fill': fill, '--paper-pen': pen } as CSSProperties}
      data-blank={blank ? '' : undefined}
      data-inked={inked ? '' : undefined}
      data-shape-pending={d ? undefined : ''}
      {...data}
    >
      {d && (
        <svg className={styles.paperFill} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <path d={d} fill={fill} />
        </svg>
      )}
      {d && wash && <BrushWash w={w} h={h} d={d} color={wash.color} x={wash.x} y={wash.y} on={wash.on} duration={wash.duration ?? 520} overshoot={6} />}
      {d && <ShapeGrain w={w} h={h} d={d} seed={seed} opacity={grain} />}
      {d && (
        <svg className={styles.paperPen} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {blank && (
            <path
              d={d}
              fill="none"
              stroke={pen}
              strokeWidth={INK}
              strokeDasharray="7 8"
              strokeLinecap="round"
              data-outline-dash=""
              className={styles.dash}
            />
          )}
          <path
            d={d}
            fill="none"
            stroke={blank && penInk ? penInk : pen}
            strokeWidth={INK}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-outline=""
            className={blank ? styles.ink : undefined}
          />
        </svg>
      )}
      <div className={[styles.paperBody, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
});

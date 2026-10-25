'use client';

import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { boundaryPoints, polyline } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { floatingPath } from './FloatingSlip';
import styles from './Thread.module.css';

/** The capsule's one-line height on every platform: one line sits centred in it at any text size (round 9 §4). */
export const CAPSULE_H = 48;
/** The send segment's width — the capsule's end, cut off by a wavy seam. */
export const SEND_SEGMENT_W = 52;
/** The field's corner (Field's R). */
const CAPSULE_R = 16;
const SEED = 23;

/**
 * The capsule's drawing at `w` × `h`: its outline (the field's wobble), the
 * send segment's region past the seam (reaching out past the outline, which
 * clips it), and the seam itself — one point list for both, as the segmented
 * bar's, so the face's edge lies exactly under the seam.
 */
export function capsuleShape(w: number, h: number) {
  if (!w || !h) return null;
  const outline = floatingPath(w, h, CAPSULE_R, SEED);
  const pad = Math.max(12, h * 0.3);
  const seamPts = boundaryPoints(w - SEND_SEGMENT_W, h, SEED + 11, 1.6, pad);
  const seam = polyline(seamPts);
  const segment = `${seam} L ${w + pad},${h + pad} L ${w + pad},${-pad} Z`;
  return { outline, seam, segment };
}

export interface ComposerCapsuleProps {
  /** The ＋, the file input and the field, in that order (Send is the capsule's own). */
  children: ReactNode;
  /** The field is written in: its pen darkens (the field's own darker ink, never another colour). */
  focused: boolean;
  /** There is something to send: the segment takes the verb's solid face. */
  ready: boolean;
  sendLabel: string;
  onSend: () => void;
}

/**
 * The composer's capsule (round 9 §4): one hand-drawn field — the field's
 * wobble, cream, its pen at INK darkening while written in (round 10 §3.3) —
 * holding the ＋, the text and Send; the foot's paper behind it (the dock's)
 * keeps the thread from showing round it. Send is
 * the capsule's end segment in the segmented bar's language: a wavy seam cut
 * across it in the paper's colour, the segment the tonal peach with a
 * terracotta plane while there is nothing to send, the verb's solid
 * terracotta with a cream plane once there is (a 140 ms change). It is
 * disabled by its semantics (aria-disabled), never by a fade: it floats over
 * the thread, and nothing of a floating thing is see-through. One line is
 * exactly 48 tall; only more lines grow it, up to five.
 */
export function ComposerCapsule({ children, focused, ready, sendLabel, onSend }: ComposerCapsuleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const shape = useMemo(() => capsuleShape(w, h), [w, h]);
  const clipId = `composer-clip-${useId().replace(/:/g, '')}`;
  // The send segment's hover brush, from where the pointer came in (as a button's).
  const [hover, setHover] = useState({ x: w - SEND_SEGMENT_W / 2, y: h / 2, on: false });
  const at = (e: MouseEvent<HTMLButtonElement>, on: boolean) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, on });
  };

  return (
    <div
      ref={ref}
      className={`${styles.capsule} res-shape-stand-in`}
      data-focus={focused || undefined}
      data-ready={ready || undefined}
      data-shape-pending={shape ? undefined : ''}
      style={{ '--shape-radius': `${CAPSULE_R}px`, '--shape-ink-width': `${INK}px` } as CSSProperties}
    >
      {shape && (
        <>
          {/* The field's cream and the send segment's face — under what is in it. */}
          <svg aria-hidden="true" className={styles.capsuleShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <defs>
              <clipPath id={clipId}>
                <path d={shape.outline} />
              </clipPath>
            </defs>
            <path d={shape.outline} className={styles.paperFill} />
            <path d={shape.segment} className={styles.sendFace} clipPath={`url(#${clipId})`} />
          </svg>
          {/* The segment's grain and its hover brush, cut to the capsule's outline. */}
          <div className={styles.capsuleSegmentLayer} style={{ width: w, height: h, clipPath: `path('${shape.outline}')` }} aria-hidden="true">
            <ShapeGrain w={w} h={h} d={shape.segment} seed={SEED} opacity={0.38} frequency={1.1} />
            <BrushWash w={w} h={h} d={shape.segment} color="oklch(0% 0 0 / 0.14)" x={hover.x} y={hover.y} on={ready && hover.on} duration={340} overshoot={4} />
          </div>
          {/* The seam in the paper's colour and the pen line over everything. */}
          <svg aria-hidden="true" className={styles.capsuleShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <path d={shape.seam} className={styles.sendSeam} strokeWidth={INK} clipPath={`url(#${clipId})`} />
            <path d={shape.outline} className={styles.capsulePen} strokeWidth={INK} />
          </svg>
        </>
      )}
      {children}
      <button
        type="button"
        className={styles.send}
        aria-label={sendLabel}
        title={sendLabel}
        aria-disabled={!ready || undefined}
        onClick={() => ready && onSend()}
        onMouseEnter={(e) => at(e, true)}
        onMouseLeave={(e) => at(e, false)}
      >
        {/* On the last line's row, beside the ＋ — not in the middle of a tall field. */}
        <span className={styles.sendGlyph}>
          <Icon name="send" size={20} color="currentColor" strokeWidth={INK} />
        </span>
      </button>
    </div>
  );
}

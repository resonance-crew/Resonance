'use client';

import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { polyline } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { CAPSULE_H, CAPSULE_R, segmentCapsuleShape, type SegmentCapsuleShape } from '@/components/molecules/SegmentedActionBar/segmentCapsule';
import { makePrng } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './Thread.module.css';

export { CAPSULE_H };
/** The send segment's width — the capsule's end, cut off by a wavy seam. */
export const SEND_SEGMENT_W = 52;
const SEED = 23;

/**
 * The capsule's drawing at `w` × `h`: its outline (the field's wobble), the
 * send segment's region past the seam (reaching out past the outline, which
 * clips it), and the seam itself — one point list for both, as the segmented
 * bar's, so the face's edge lies exactly under the seam. The publish step's
 * tag field is the same shape with its own end (segmentCapsuleShape).
 */
export function capsuleShape(w: number, h: number) {
  return segmentCapsuleShape(w, h, SEND_SEGMENT_W, SEED);
}

/** How round the send block's top-left turn is (round 22, the owner's: it turned too sharply). */
export const BLOCK_TURN_R = 16;

/**
 * A field of more than one line (round 22, the owner's notes), and the grown
 * field (option C): the same outline, the send segment a {@link SEND_SEGMENT_W}
 * × {@link CAPSULE_H} block on the last row — its wavy seam coming up its left
 * side and turning, round ({@link BLOCK_TURN_R}), along its top to the
 * capsule's end — so the text keeps the whole width left of the send column,
 * whose room above the block holds ⤢.
 */
export function blockCapsuleShape(w: number, h: number): SegmentCapsuleShape | null {
  const base = segmentCapsuleShape(w, h, SEND_SEGMENT_W, SEED);
  if (!base) return null;
  const x = w - SEND_SEGMENT_W;
  const y = Math.max(0, h - CAPSULE_H);
  const R = Math.min(BLOCK_TURN_R, CAPSULE_H / 2);
  const rnd = makePrng(SEED + 11);
  const wob = (amp: number) => +((rnd() - 0.5) * 2 * amp).toFixed(2);
  const pad = 12;
  const f = (n: number) => +n.toFixed(2);
  const turn: [number, number][] = [];
  // A quarter circle from the block's left side to its top, centred R in from the corner.
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * (Math.PI / 2);
    turn.push([f(x + R + R * Math.cos(a)), f(y + R + R * Math.sin(a))]);
  }
  const pts: [number, number][] = [
    [f(x), f(h + pad)],
    [f(x), f(h)],
    [f(x + wob(1.2)), f(y + R + (CAPSULE_H - R) * 0.5)],
    ...turn,
    [f(x + R + (SEND_SEGMENT_W - R) * 0.55), f(y + wob(1.2))],
    [f(w), f(y)],
    [f(w + pad), f(y)],
  ];
  const seam = polyline(pts);
  return { outline: base.outline, seam, segment: `${seam} L ${f(w + pad)},${f(h + pad)} Z` };
}

/** What the end segment does: send (its plane), or — the sticker panel open, nothing to send — grow or shrink it. */
export type CapsuleSegment = 'send' | 'expand' | 'collapse';

export interface ComposerCapsuleProps {
  /** The ＋, the file input, the field and the ☺ column, in that order (Send is the capsule's own). */
  children: ReactNode;
  /** The field is written in: its pen darkens (the field's own darker ink, never another colour). */
  focused: boolean;
  /** There is something to send: the segment takes the verb's solid face. */
  ready: boolean;
  /** The end segment's verb: Send by default; ↑ / ↓ grow and shrink the sticker panel (round 22 §4.1). */
  segment?: CapsuleSegment;
  /** The segment's accessible name (Send, 展開貼圖, 收合貼圖). */
  sendLabel: string;
  onSend: () => void;
  /** The field grown on purpose (option C). */
  expanded?: boolean;
  /** More than one line (or grown): the send segment a 52 × 48 block on the last row, not a full-height strip. */
  block?: boolean;
  /** What stands in the send column over the block, at the capsule's top-right: ⤢ / ⤡. */
  aboveSend?: ReactNode;
}

/**
 * The composer's capsule (round 9 §4): one hand-drawn field — the field's
 * wobble, cream, its pen at INK darkening while written in (round 10 §3.3) —
 * holding the ＋, the text, the ☺ (round 22) and Send; the foot's paper behind
 * it (the dock's) keeps the thread from showing round it. Send is the
 * capsule's end segment in the segmented bar's language: a wavy seam cut
 * across it in the paper's colour, the segment the tonal peach with a
 * terracotta plane while there is nothing to send, the verb's solid
 * terracotta with a cream plane once there is (a 140 ms change). It is
 * disabled by its semantics (aria-disabled), never by a fade: it floats over
 * the thread, and nothing of a floating thing is see-through. One line is
 * exactly 48 tall; only more lines grow it, up to five — or, grown on purpose
 * (`expanded`), as tall as the thread lets it. From its second line the
 * segment is a block on its last row (`block`), ⤢ over it at the top-right.
 */
export function ComposerCapsule({
  children,
  focused,
  ready,
  segment = 'send',
  sendLabel,
  onSend,
  expanded = false,
  block = false,
  aboveSend,
}: ComposerCapsuleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const asBlock = block || expanded;
  const shape = useMemo(() => (asBlock ? blockCapsuleShape(w, h) : capsuleShape(w, h)), [w, h, asBlock]);
  const clipId = `composer-clip-${useId().replace(/:/g, '')}`;
  // Send acts only with something to send; ↑ / ↓ always.
  const acts = segment !== 'send' || ready;
  // The send segment's hover brush, from where the pointer came in (as a button's).
  const [hover, setHover] = useState({ x: w - SEND_SEGMENT_W / 2, y: h / 2, on: false });
  // The hover brush is a mouse's alone: a tap's compatibility mouseenter comes with no mouseleave, and the
  // segment would keep the brush after the send (round 17 review W9, as the tag field's).
  const at = (e: PointerEvent<HTMLButtonElement>, on: boolean) => {
    if (e.pointerType !== 'mouse') return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, on });
  };

  return (
    <div
      ref={ref}
      className={`${styles.capsule} res-shape-stand-in`}
      data-focus={focused || undefined}
      data-ready={(segment === 'send' && ready) || undefined}
      data-expanded={expanded || undefined}
      data-block={asBlock || undefined}
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
            <BrushWash w={w} h={h} d={shape.segment} color="color-mix(in oklch, var(--toward-ink) 14%, transparent)" x={hover.x} y={hover.y} on={acts && hover.on} duration={340} overshoot={4} />
          </div>
          {/* The seam in the paper's colour and the pen line over everything. */}
          <svg aria-hidden="true" className={styles.capsuleShape} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <path d={shape.seam} className={styles.sendSeam} strokeWidth={INK} clipPath={`url(#${clipId})`} />
            <path d={shape.outline} className={styles.capsulePen} strokeWidth={INK} />
          </svg>
        </>
      )}
      {children}
      {/* The send column: the segment (a strip, or the block on the last row) and, above the block, ⤢. */}
      <div className={styles.sendColumn}>
        {aboveSend && <div className={styles.aboveSend}>{aboveSend}</div>}
        <button
          type="button"
          className={styles.send}
          aria-label={sendLabel}
          title={sendLabel}
          aria-disabled={!acts || undefined}
          aria-expanded={segment === 'send' ? undefined : segment === 'collapse'}
          data-segment={segment}
          onClick={() => acts && onSend()}
          onPointerEnter={(e) => at(e, true)}
          onPointerLeave={(e) => at(e, false)}
        >
          {/* On the last line's row, beside the ＋ — not in the middle of a tall field. */}
          <span className={styles.sendGlyph} style={segment === 'collapse' ? { transform: 'rotate(180deg)' } : undefined}>
            <Icon name={segment === 'send' ? 'send' : 'arrow-up'} size={20} color="currentColor" strokeWidth={INK} />
          </span>
        </button>
      </div>
    </div>
  );
}

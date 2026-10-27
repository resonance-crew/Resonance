'use client';

import { useState, type MouseEvent, type RefObject } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { rowRegion } from '@/lib/design/rowMenu';
import styles from './RowInk.module.css';

// The wash under a dropdown's active row. Every organic dropdown (the avatar
// menu, the card「⋯」menu, `<Select>`) washes its row the way OrganicButton
// does on hover: an ink circle that spreads from where the pointer landed out
// to the panel's far corner, clipped to the row's wavy region. The native apps
// do the same on press. `useRowInk` holds the state, `<RowInkWash>` draws it
// inside the panel's clipped SVG group.

export interface RowInkRow {
  top: number;
  height: number;
}

export interface UseRowInkOptions {
  /** The panel the rows sit in; pointer positions are measured against it. */
  panelRef: RefObject<HTMLElement | null>;
  /** Each row's offset + height inside the panel — where keyboard ink starts. */
  rows?: RowInkRow[];
  w: number;
  h: number;
  /**
   * The row the keyboard is on. The ink rests there whenever the pointer is
   * not over a row, and grows from its centre. Leave it null for a menu the
   * keyboard does not walk (or a mouse-driven moment), and the ink follows the
   * pointer alone.
   */
  activeIndex?: number | null;
}

export interface RowInk {
  /** The row wearing the ink now: the hovered one, or the keyboard's. */
  index: number | null;
  /** Where the ink spreads from, in panel coordinates. */
  cx: number;
  cy: number;
  /** Radius that reaches the panel's farthest corner from (cx, cy). */
  maxR: number;
  /**
   * Hover handlers for row `i`. `onEnter` runs when the pointer takes the row
   * over (entering it, or moving on it after the keyboard had moved on), so a
   * menu can sync its own active index with the hover.
   */
  rowProps: (
    i: number,
    onEnter?: () => void,
  ) => {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => void;
    onMouseMove: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onPointerDown: (e: MouseEvent<HTMLElement> & { pointerType?: string }) => void;
  };
}

export function useRowInk({ panelRef, rows, w, h, activeIndex = null }: UseRowInkOptions): RowInk {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // Menus move their active row to the hovered one on enter, so the two only
  // differ once the keyboard has walked away from the pointer — and then the
  // keyboard is the one being followed.
  const index = activeIndex !== null && activeIndex !== hovered ? activeIndex : hovered;

  // Pointer ink starts where the pointer is; keyboard ink from the row's
  // centre. With no row inked the last pointer spot stays, so the ink that is
  // withdrawing shrinks back toward where the pointer left.
  let origin = { x: w / 2, y: h / 2 };
  const keyRow = index !== null ? rows?.[index] : undefined;
  if (index !== null && index === hovered && pointer) origin = pointer;
  else if (keyRow) origin = { x: w / 2, y: keyRow.top + keyRow.height / 2 };
  else if (pointer) origin = pointer;

  const maxR = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) + 4;

  // Returns whether the pointer really is somewhere new: browsers replay a
  // mousemove at the same spot after layout changes, and that must not steal
  // the ink back from the keyboard.
  const record = (e: MouseEvent<HTMLElement>): boolean => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return false;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (pointer && pointer.x === x && pointer.y === y) return false;
    setPointer({ x, y });
    return true;
  };

  const rowProps: RowInk['rowProps'] = (i, onEnter) => ({
    onMouseEnter: (e) => {
      record(e);
      setHovered(i);
      onEnter?.();
    },
    // The spot is taken once, on the way in: following every move would slide
    // the circle's centre and restart its 340ms spread, so the ink would stall
    // while the pointer wanders along the row. A move only matters when the
    // keyboard had walked away and the pointer takes the row back.
    onMouseMove: (e) => {
      if (index !== i && record(e)) {
        setHovered(i);
        onEnter?.();
      }
    },
    onMouseLeave: () => setHovered((cur) => (cur === i ? null : cur)),
    // A finger (or a pen) presses: the ink spreads from where it landed at once — a touch screen's compatibility
    // mouse events come only after the finger lifts, too late to show the press.
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      record(e);
      setHovered(i);
      onEnter?.();
    },
  });

  return { index, cx: origin.x, cy: origin.y, maxR, rowProps };
}

export interface RowInkWashProps {
  /** Unique per panel (the `useId` the menu already keeps), to namespace mask ids. */
  uid: string;
  ink: RowInk;
  /** The wavy dividers between rows, exactly as the panel draws them. */
  boundaries: [number, number][][];
  w: number;
  h: number;
  pad: number;
  /** The ink colour of each row; its length is the row count. */
  fills: string[];
}

/**
 * One masked wash per row: each row's region is revealed through its own
 * circle, which is 0 until the row is inked. Render it inside the panel's
 * clipped group, after the card fill (and any resting wash, e.g. a
 * destructive row's warning yellow) so the ink lands on top.
 */
export function RowInkWash({ uid, ink, boundaries, w, h, pad, fills }: RowInkWashProps) {
  return (
    <>
      <defs>
        {fills.map((_, i) => (
          <mask
            key={i}
            id={`rowink-${uid}-${i}`}
            maskUnits="userSpaceOnUse"
            x={-w}
            y={-h}
            width={w * 3}
            height={h * 3}
          >
            <circle
              className={styles.circle}
              cx={ink.cx}
              cy={ink.cy}
              r={ink.index === i ? ink.maxR : 0}
              // colour-fixed: a mask's luminance, not a colour anyone sees
              fill="white"
            />
          </mask>
        ))}
      </defs>
      {fills.map((fill, i) => (
        <g key={i} mask={`url(#rowink-${uid}-${i})`}>
          <path d={rowRegion(i, fills.length, boundaries, w, h, pad)} fill={fill} />
        </g>
      ))}
    </>
  );
}

export interface RowBrushesProps {
  w: number;
  h: number;
  /** The sheet's wobbly outline (atoms/PaperSheet's `sheetPath`): no ink ever leaves it. */
  outline: string;
  /** Each row's band within the sheet (`rowRegion`): the ink of a row stays in it. */
  bands: string[];
  ink: RowInk;
  /** Each row's ink, as long as `bands` ('transparent' for a band that takes none). */
  fills: string[];
  /** A row's resting wash under any ink (a destructive row's warning), else null. */
  rests?: (string | null)[];
  /** How long a full spread takes. */
  duration?: number;
}

/**
 * The row ink of a borderless paper sheet (round 17 §1, every menu): each
 * row's wash is a BrushWash — a disc grown by `transform` from where the
 * pointer came in (or a finger pressed, or the keyboard's row's centre) —
 * clipped to the row's band, inside a layer clipped to the sheet's own
 * wobble, so the ink fills the curved region and never a rectangle. Drawn
 * over the sheet's paper and grain, under the rows.
 */
export function RowBrushes({ w, h, outline, bands, ink, fills, rests, duration = 340 }: RowBrushesProps) {
  if (!w || !h || !outline) return null;
  return (
    <div aria-hidden="true" data-row-brushes="" className={styles.sheetInk} style={{ width: w, height: h, clipPath: `path('${outline}')` }}>
      {rests?.map((fill, i) =>
        fill ? (
          <svg key={`rest-${i}`} data-rest={i} className={styles.rest} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <path d={bands[i]} fill={fill} />
          </svg>
        ) : null,
      )}
      {bands.map((d, i) =>
        fills[i] === 'transparent' ? null : (
          <RowBrush key={i} w={w} h={h} d={d} color={fills[i]} on={ink.index === i} x={ink.cx} y={ink.cy} duration={duration} />
        ),
      )}
    </div>
  );
}

/** One row's brush: it keeps the spot it last spread from, so a wash withdrawing never jumps to where the next row's starts. */
function RowBrush({ w, h, d, color, on, x, y, duration }: { w: number; h: number; d: string; color: string; on: boolean; x: number; y: number; duration: number }) {
  const [at, setAt] = useState({ x, y });
  if (on && (at.x !== x || at.y !== y)) setAt({ x, y });
  const spot = on ? { x, y } : at;
  return <BrushWash w={w} h={h} d={d} color={color} x={spot.x} y={spot.y} on={on} duration={duration} overshoot={4} />;
}

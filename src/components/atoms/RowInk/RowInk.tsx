'use client';

import { useState, type MouseEvent, type RefObject } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import styles from './RowInk.module.css';

// The wash under a dropdown's active row. Every menu sheet (OrganicMenu, the
// avatar menu, `<Select>`) washes its row the way OrganicButton does on hover:
// ink that spreads from where the pointer landed (a finger pressed, or the
// keyboard's row's centre), clipped to the row's band within the sheet's
// wobble. The native apps do the same on press. `useRowInk` holds the state,
// `<RowBrushes>` draws it over the sheet's paper.

/** What a menu row does: an ordinary row, one that warns (封鎖: a step back from someone), or one that removes something (刪除). */
export type MenuRowTone = 'warn' | 'danger' | undefined;

/**
 * A menu row's ink under the pointer, a finger or the keyboard — the one strength every sheet uses (OrganicMenu,
 * the avatar menu, `Select`): the menu's deep pen at 15 %, or, over a warning or destructive row's own wash (see
 * `menuRowRest`), more of that row's colour.
 */
export function menuRowWash(tone: MenuRowTone = undefined): string {
  return tone === 'danger'
    ? 'color-mix(in oklch, var(--color-danger) 15%, transparent)'
    : tone === 'warn'
      ? 'var(--menu-warn-ink)'
      : 'color-mix(in oklch, var(--menu-border-hover, var(--terracotta-deep)) 15%, transparent)';
}

/**
 * The wash a row rests on before any ink (round 18, the owner's): 封鎖 on the warning yellow, 刪除 on a red one;
 * every other row on the bare paper (null). See-through, so the row is the same paper.
 */
export function menuRowRest(tone: MenuRowTone = undefined): string | null {
  return tone === 'danger'
    ? 'color-mix(in oklch, var(--color-danger) 11%, transparent)'
    : tone === 'warn'
      ? 'var(--menu-warn-rest)'
      : null;
}

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
  /** The wash a row rests on before any ink (`menuRowRest`: 封鎖's yellow, 刪除's red), null for the bare paper. */
  rests?: (string | null)[];
  /** How long a full spread takes. */
  duration?: number;
}

/**
 * The row ink of a menu sheet (round 17 §1, every menu): each
 * row's wash is a BrushWash — a disc grown by `transform` from where the
 * pointer came in (or a finger pressed, or the keyboard's row's centre) —
 * clipped to the row's band, inside a layer clipped to the sheet's own
 * wobble, so the ink fills the curved region and never a rectangle — over a
 * warning or destructive row's resting wash. Drawn over the sheet's paper,
 * under its pen line and the rows.
 */
export function RowBrushes({ w, h, outline, bands, ink, fills, rests, duration = 340 }: RowBrushesProps) {
  if (!w || !h || !outline) return null;
  return (
    <div aria-hidden="true" data-row-brushes="" className={styles.sheetInk} style={{ width: w, height: h, clipPath: `path('${outline}')` }}>
      {rests?.some(Boolean) && (
        // Drawn past the box (the bands overshoot it): the wobble swings out of the box as much as into it, and the
        // sheet's outline, the layer's clip, is what ends every wash — on the pen line, never short of it.
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.rests} overflow="visible">
          {bands.map((d, i) => (rests[i] ? <path key={i} d={d} fill={rests[i]!} data-row-rest="" /> : null))}
        </svg>
      )}
      {bands.map((d, i) =>
        fills[i] === 'transparent' ? null : (
          <RowBrush key={i} w={w} h={h} d={d} color={fills[i]} on={ink.index === i} x={ink.cx} y={ink.cy} duration={duration} />
        ),
      )}
    </div>
  );
}

/** How far a row's brush reaches past the box's far corner. */
const BRUSH_REACH = 12;

/** One row's brush: it keeps the spot it last spread from, so a wash withdrawing never jumps to where the next row's starts. */
function RowBrush({ w, h, d, color, on, x, y, duration }: { w: number; h: number; d: string; color: string; on: boolean; x: number; y: number; duration: number }) {
  const [at, setAt] = useState({ x, y });
  if (on && (at.x !== x || at.y !== y)) setAt({ x, y });
  const spot = on ? { x, y } : at;
  // It reaches past the box's far corner by more than the wobble can swing out of it (autoMag ≤ 4, and the curve's
  // handles a little more), so a spread row is inked right to its pen line.
  return <BrushWash w={w} h={h} d={d} color={color} x={spot.x} y={spot.y} on={on} duration={duration} overshoot={BRUSH_REACH} />;
}

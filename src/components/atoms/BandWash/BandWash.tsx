'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { BAND_PRESS_DELAY_MS, bandRegion } from '@/lib/design/listBands';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './BandWash.module.css';

/**
 * The class a band's row wears (round 23 §4/§5): it sets the wash its `<BandWash>` fills — nothing at rest, a fine
 * pointer over it 6 % toward the ink, a press (`useBandPress`'s `data-band-pressed`) 12 %: the same mixes at night,
 * where the ink turns light. Never `:active`, which a finger scrolling the list would flicker on every row it
 * starts on.
 */
export const bandHost = styles.host;

export interface BandWashProps {
  /** The key of the curve along the row's top: its own (`lib/design/listBands`). */
  topKey: string;
  /** The key of the curve along its bottom: the row below's, a title's, or the list's end (`bandsBelow`). */
  bottomKey: string;
  className?: string;
}

/**
 * A row's band (round 23 §4/§5, the owner: 「沒有真的一個 border，只是…用這一條有機的曲線分開的區塊」): the row's whole
 * box between two hand-drawn curves it shares with its neighbours, swinging 2 past the box (drawn unclipped), filled
 * with the wash its row (`bandHost`) sets — so a band shows only while it is pointed at or pressed, and the curves
 * are its edges. Each row draws its own (no list-level measuring); the curves are seeded by keys, so two touching
 * rows draw the one between them exactly alike. The bell's list and a phone's conversation list wear it; the
 * conversation list's wide rows and the thread's search keep RowWash.
 */
export function BandWash({ topKey, bottomKey, className }: BandWashProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);
  const d = useMemo(() => (w > 0 && h > 0 ? bandRegion(w, h, topKey, bottomKey) : ''), [w, h, topKey, bottomKey]);
  return (
    <span ref={ref} className={`${styles.band}${className ? ` ${className}` : ''}`} aria-hidden data-band="">
      {d && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible" className={styles.svg}>
          <path d={d} className={styles.fill} />
        </svg>
      )}
    </span>
  );
}

/** How far a finger may wander before its press counts as the start of a scroll. */
const SLOP = 8;

export interface BandPress {
  'data-band-pressed'?: '';
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

/**
 * A press as a band shows it (round 23 §4): on after `BAND_PRESS_DELAY_MS` held, off on lifting, on leaving the row,
 * on moving past a finger's slop, when the browser takes the touch for a scroll (`pointercancel`) or anything scrolls
 * — so scrolling a list never flickers its rows. A tap lifted before the delay still shows the band for as long, as
 * a tap's ripple would. Spread the returned props on the row (beside `bandHost`); it only watches, so the row's own
 * click is untouched.
 */
export function useBandPress(): BandPress {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const stopScroll = useRef<(() => void) | null>(null);

  const settle = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
    stopScroll.current?.();
    stopScroll.current = null;
  };
  const cancel = () => {
    settle();
    if (flash.current) clearTimeout(flash.current);
    flash.current = null;
    setPressed(false);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (flash.current) clearTimeout(flash.current);
      stopScroll.current?.();
    },
    [],
  );

  return {
    'data-band-pressed': pressed ? '' : undefined,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        setPressed(true);
      }, BAND_PRESS_DELAY_MS);
      // Anything scrolling (the list, the page, a dialog's body) ends the press.
      const onScroll = () => cancel();
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      stopScroll.current = () => window.removeEventListener('scroll', onScroll, { capture: true });
    },
    onPointerMove: (e) => {
      const at = start.current;
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > SLOP) cancel();
    },
    onPointerUp: () => {
      if (!start.current) return;
      const early = timer.current !== null;
      settle();
      if (!early) {
        setPressed(false);
        return;
      }
      // Lifted before the delay: the band shows for as long, then goes.
      setPressed(true);
      flash.current = setTimeout(() => {
        flash.current = null;
        setPressed(false);
      }, BAND_PRESS_DELAY_MS);
    },
    onPointerCancel: cancel,
    // A finger's leave comes after its lift (and must not cut the tap's flash short); only a press still held ends.
    onPointerLeave: () => {
      if (start.current) cancel();
    },
  };
}

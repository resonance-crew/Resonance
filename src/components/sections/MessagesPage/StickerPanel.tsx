'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Thread.module.css';

/** How far a drag must carry the panel (of the way from one height to the other) to settle at the other. */
const SNAP = 0.3;

export interface StickerPanelProps {
  /** Its height at rest: the keyboard's last height (or 300). */
  base: number;
  /** Its height grown, to just under the thread's header. */
  tall: number;
  /** Grown (by ↑, or a drag up through the grid). */
  isTall: boolean;
  onTallChange: (tall: boolean) => void;
  /** The grid's scroller, which a drag grows the panel through before it scrolls. */
  gridRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * The sticker panel in the keyboard's place on a phone (round 22 §4.1, §6.3):
 * under the capsule, on the foot's own paper — no card, no line — as tall as
 * the keyboard was. ↑ in the send segment grows it to just under the header
 * (the capsule riding up with it), ↓ brings it back; a finger scrolling the
 * grid up grows it first, and only then scrolls the grid (and, grown, a
 * finger pulling the grid down from its top shrinks it again) — the nested
 * scroll Telegram's panel has.
 */
export function StickerPanel({ base, tall, isTall, onTallChange, gridRef, children }: StickerPanelProps) {
  const target = isTall ? Math.max(base, tall) : base;
  // A height a finger is dragging it to (null at rest).
  const [drag, setDrag] = useState<number | null>(null);
  const live = useRef({ base, tall, isTall, onTallChange });
  live.current = { base, tall, isTall, onTallChange };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let startY: number | null = null;
    let from = 0;
    let height: number | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      from = live.current.isTall ? Math.max(live.current.base, live.current.tall) : live.current.base;
      height = null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const { base: b, tall: t, isTall: grown } = live.current;
      const top = Math.max(b, t);
      const dy = startY - e.touches[0].clientY;
      // Up through the grid at rest: the panel grows first. Down from the grid's top when grown: it shrinks.
      const growing = !grown && dy > 0;
      const shrinking = grown && dy < 0 && grid.scrollTop <= 0;
      if (!growing && !shrinking && height == null) return;
      const next = Math.min(top, Math.max(b, from + dy));
      if (height == null && (next === from || (grown && next === top && dy > 0))) return;
      e.preventDefault();
      height = next;
      setDrag(next);
    };
    const onEnd = () => {
      if (height != null) {
        const { base: b, tall: t, isTall: grown, onTallChange: change } = live.current;
        const top = Math.max(b, t);
        const moved = grown ? (top - height) / Math.max(1, top - b) : (height - b) / Math.max(1, top - b);
        if (moved >= SNAP) change(!grown);
      }
      startY = null;
      height = null;
      setDrag(null);
    };
    grid.addEventListener('touchstart', onStart, { passive: true });
    grid.addEventListener('touchmove', onMove, { passive: false });
    grid.addEventListener('touchend', onEnd);
    grid.addEventListener('touchcancel', onEnd);
    return () => {
      grid.removeEventListener('touchstart', onStart);
      grid.removeEventListener('touchmove', onMove);
      grid.removeEventListener('touchend', onEnd);
      grid.removeEventListener('touchcancel', onEnd);
    };
  }, [gridRef]);

  // Settled at the other height: the grid starts at its top again only when it shrank.
  const wasTall = useRef(isTall);
  useLayoutEffect(() => {
    if (wasTall.current && !isTall && gridRef.current) gridRef.current.scrollTop = 0;
    wasTall.current = isTall;
  }, [isTall, gridRef]);

  return (
    <div className={styles.stickerPanel} data-tall={isTall || undefined} data-dragging={drag != null || undefined} style={{ height: drag ?? target }}>
      {children}
    </div>
  );
}

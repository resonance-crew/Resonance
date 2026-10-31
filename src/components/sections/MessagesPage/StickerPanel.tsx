'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import styles from './Thread.module.css';

export interface StickerPanelProps {
  /** Its height at rest: the keyboard's last height (or 300). */
  base: number;
  /** Its height grown, to just under the thread's header. */
  tall: number;
  /** Grown — by ↑ in the send segment alone (round 22, the owner's notes: a finger scrolling the grid only scrolls it). */
  isTall: boolean;
  /** The grid's scroller: back at its top when the panel shrinks. */
  gridRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * The sticker panel in the keyboard's place on a phone (round 22 §4.1, §6.3):
 * under the capsule, on the foot's own paper — no card, no line — as tall as
 * the keyboard was, its grid scrolling down to the screen's edge (its fade the
 * edge, the last row clear of the home indicator). ↑ in the send segment grows
 * it to just under the header and ↓ brings it back — one height animation the
 * capsule rides on, its segment and glyph with it; scrolling the grid only
 * scrolls the grid.
 */
export function StickerPanel({ base, tall, isTall, gridRef, children }: StickerPanelProps) {
  const height = isTall ? Math.max(base, tall) : base;
  // Shrunk again: the grid starts at its top.
  const wasTall = useRef(isTall);
  useLayoutEffect(() => {
    if (wasTall.current && !isTall && gridRef.current) gridRef.current.scrollTop = 0;
    wasTall.current = isTall;
  }, [isTall, gridRef]);

  return (
    <div className={styles.stickerPanel} data-tall={isTall || undefined} style={{ height }}>
      {children}
    </div>
  );
}

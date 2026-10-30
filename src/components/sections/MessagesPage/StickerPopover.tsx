'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { PaperSheet } from '@/components/atoms/PaperSheet/PaperSheet';
import { placePopover } from '@/lib/chat/menuPlacement';
import styles from './Thread.module.css';

/** The popover's size (round 22 §4.1): the pack bar and five columns of stickers. */
export const STICKER_POPOVER_W = 360;
export const STICKER_POPOVER_H = 420;

export interface StickerPopoverProps {
  /** The ☺ it hangs from. */
  anchor: HTMLElement;
  /** It goes (Escape, a press outside, the ☺ again): the focus goes back to the field. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The stickers on a desktop (round 22 §4.1; a mouse, 768 wide or more): a
 * flat menu sheet (PaperSheet: the menu paper, the grey pen line, no shadow)
 * hanging over the ☺, its end on the ☺'s, about 360 × 420 — the pack bar and
 * the grid. Escape or a press outside puts it away; the ☺ is a toggle. It
 * stays where it opened (the thread scrolling under it leaves it be: it holds
 * what is being written, not a message).
 */
export function StickerPopover({ anchor, onClose, children }: StickerPopoverProps) {
  const t = useTranslations('messages');
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const at = () => {
      const r = anchor.getBoundingClientRect();
      const p = placePopover({
        anchor: r,
        width: STICKER_POPOVER_W,
        height: STICKER_POPOVER_H,
        prefer: 'above',
        align: 'end',
        viewport: { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight },
      });
      setPlace({ top: p.top, left: p.left });
    };
    at();
    window.addEventListener('resize', at);
    return () => window.removeEventListener('resize', at);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (root.current?.contains(target) || anchor.contains(target)) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={root}
      className={styles.stickerPopover}
      role="dialog"
      aria-label={t('stickers')}
      style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, opacity: 0, pointerEvents: 'none' }}
    >
      <PaperSheet w={STICKER_POPOVER_W} h={STICKER_POPOVER_H} R={20} seed={59} />
      <div className={styles.stickerPopoverBody}>{children}</div>
    </div>,
    document.body,
  );
}

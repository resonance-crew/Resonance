'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { PaperSheet } from '@/components/atoms/PaperSheet/PaperSheet';
import { placePopover } from '@/lib/chat/menuPlacement';
import styles from './Thread.module.css';

/** The popover's size (round 23): the pack bar and four columns of stickers, each as big as a phone's. */
export const STICKER_POPOVER_W = 400;
export const STICKER_POPOVER_H = 460;

export interface StickerPopoverProps {
  /** The ☺ it belongs to: its end lines up with the ☺'s, and a press on it is the ☺'s (a toggle). */
  anchor: HTMLElement;
  /**
   * What it hangs over: the capsule, whose top edge — over what rides in it — it stands on (round 23), never on the
   * rows. Without it, the ☺'s own top.
   */
  above?: HTMLElement;
  /** It goes (Escape, a press outside, the ☺ again): the focus goes back to the field. */
  onClose: () => void;
  /** Its sheet, for the composer to know where it lay once it goes. */
  boxRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * The stickers on a desktop (round 22 §4.1; a mouse, 768 wide or more): a
 * flat menu sheet (PaperSheet: the menu paper, the grey pen line, no shadow)
 * hanging over the capsule's top edge, its end on the ☺'s, 400 × 460 — the
 * pack bar and four columns (round 23). A sticker tapped goes, and the
 * popover with it (the field writing again); Escape or a press outside puts
 * it away; the ☺ is a toggle. It stays where it opened (the thread scrolling
 * under it leaves it be: it holds what is being written, not a message) —
 * placed again only when the capsule's height changes.
 */
export function StickerPopover({ anchor, above, onClose, boxRef, children }: StickerPopoverProps) {
  const t = useTranslations('messages');
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const at = () => {
      const r = anchor.getBoundingClientRect();
      const top = above ? above.getBoundingClientRect().top : r.top;
      const p = placePopover({
        anchor: { top, bottom: r.bottom, left: r.left, right: r.right },
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
    const ro = above && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(at) : null;
    if (above) ro?.observe(above);
    return () => {
      window.removeEventListener('resize', at);
      ro?.disconnect();
    };
  }, [anchor, above]);

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
      ref={(el) => {
        root.current = el;
        if (boxRef) boxRef.current = el;
      }}
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

'use client';

import { useCallback, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PaperSheet } from '@/components/atoms/PaperSheet/PaperSheet';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { prefersStill } from '@/lib/chat/stickerPlayback';
import { stickerName, stickerPath, type StickerRef } from '@/lib/stickers/catalog';
import { stickerCellPath } from './StickerPicker';
import styles from './Thread.module.css';

export interface StickerPreviewProps {
  sticker: StickerRef;
  /** A tap on it sends it. */
  onSend: () => void;
  /** Where it lies: floating over the thread's foot above the capsule (a phone), or inside the desktop popover. */
  placement: 'foot' | 'popover';
}

/**
 * A sticker picked, before it goes (round 22 §4.1): moving, about 144 across,
 * on a menu sheet — over the thread's foot above the capsule on a phone, at
 * the foot of the popover on a desktop — with 「再點一次傳送」 under it. A tap
 * on it (or on the same sticker again) sends it; anywhere else puts it away.
 * Its words are said to a screen reader (「預覽：謝謝，再點一次傳送」) by the composer's live line.
 */
export function StickerPreview({ sticker, onSend, placement }: StickerPreviewProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref);
  const name = stickerName(sticker, locale) ?? '';
  // Its edge is its cell's orange wash grown (the owner's notes, 2026-11-01): one shape, so the two read as one.
  const outline = useCallback((width: number, height: number) => stickerCellPath(width, height, sticker), [sticker]);
  // The moving file here (fetched afresh per sticker, so it plays from its start); its key frame with less motion.
  const src = stickerPath(sticker, prefersStill() ? 'thumb' : 'anim');
  return (
    <button
      ref={ref}
      type="button"
      className={styles.stickerPreview}
      data-placement={placement}
      data-sticker-preview=""
      aria-label={t('stickerPreviewA11y', { name })}
      onClick={(e) => {
        e.stopPropagation();
        onSend();
      }}
    >
      <PaperSheet w={w} h={h} seed={47} outline={outline} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={`${sticker.pack}/${sticker.id}`} className={styles.stickerPreviewArt} src={src} alt="" draggable={false} />
      <span className={styles.stickerPreviewHint} aria-hidden="true">
        {t('stickerPreviewHint')}
      </span>
    </button>
  );
}

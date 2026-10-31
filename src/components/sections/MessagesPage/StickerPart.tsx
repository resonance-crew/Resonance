'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { artTopOf, prefersStill, stickerBlob, stickerPlayback } from '@/lib/chat/stickerPlayback';
import { stickerName, stickerOf, stickerPath, type StickerRef } from '@/lib/stickers/catalog';
import styles from './Thread.module.css';

export interface StickerPartProps {
  /** The message's key: what "played once" is kept by. */
  messageKey: string;
  sticker: StickerRef;
  /** Its fallback words (〔貼圖：謝謝〕), shown only when the sticker can't be drawn. */
  fallback: string;
  /** False for the lifted copy (the overlay's): it shows the key frame and answers nothing. */
  interactive: boolean;
  title?: string;
  /** It could not be drawn: the row shows its fallback words in a bubble instead. */
  onFailed?: () => void;
}

/**
 * A sticker in the thread (round 22 §4.5): no bubble — the 小紙團 stands on
 * the page, 128 on a phone, 144 wider, on its sender's side. It plays its two
 * loops the first time it comes on screen (once per message for the page),
 * then rests on its key frame; a tap plays it again. At most three move at
 * once, one leaving the screen stops, and with reduced motion it only ever
 * shows its key frame. A sticker this build doesn't know is read from the
 * site's own address all the same (a later pack); one that can't be read at
 * all is its fallback words.
 */
export function StickerPart({ messageKey, sticker, fallback, interactive, title, onFailed }: StickerPartProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const known = stickerOf(sticker.pack, sticker.id);
  const name = stickerName(sticker, locale);
  const thumb = stickerPath(sticker, 'thumb');
  const anim = stickerPath(sticker, 'anim');
  const label = name ? t('stickerLabel', { name }) : fallback || t('stickerUnknown');
  const [src, setSrc] = useState(thumb);
  // Where its drawing starts in its square (px): a sticker answering a quote comes up over it by its drawing.
  const [artTop, setArtTop] = useState(0);
  const measure = (img: HTMLImageElement) => {
    if (img.src.includes('.thumb.')) setArtTop(Math.round(artTopOf(img) * img.clientHeight));
  };
  const ref = useRef<HTMLSpanElement>(null);
  const ending = useRef<(() => void) | null>(null);
  const timer = useRef<number | null>(null);
  const objectUrl = useRef<string | null>(null);
  const alive = useRef(true);

  /** Back on its key frame, the animation's frames let go. */
  const rest = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    ending.current?.();
    ending.current = null;
    if (!alive.current) return;
    setSrc(thumb);
    const url = objectUrl.current;
    objectUrl.current = null;
    // Revoked once the key frame has taken its place.
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [thumb]);

  const play = useCallback(() => {
    if (prefersStill()) return;
    void stickerBlob(anim).then(
      (blob) => {
        if (!alive.current) return;
        const url = URL.createObjectURL(blob);
        const before = objectUrl.current;
        objectUrl.current = url;
        if (before) window.setTimeout(() => URL.revokeObjectURL(before), 1000);
        ending.current?.();
        ending.current = stickerPlayback.start(messageKey, () => {
          ending.current = null;
          rest();
        });
        setSrc(url);
        if (timer.current != null) window.clearTimeout(timer.current);
        // Two plays, then it holds its key frame: back to the light file then.
        timer.current = window.setTimeout(() => {
          timer.current = null;
          stickerPlayback.end(messageKey);
          rest();
        }, (known?.durationMs ?? 2000) * 2 + 120);
      },
      () => undefined,
    );
  }, [anim, known?.durationMs, messageKey, rest]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current != null) window.clearTimeout(timer.current);
      stickerPlayback.end(messageKey);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [messageKey]);

  // On screen for the first time: it plays. Off screen while moving: it stops.
  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (stickerPlayback.firstSight(messageKey)) play();
        } else if (stickerPlayback.moving.includes(messageKey)) {
          stickerPlayback.end(messageKey);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [interactive, messageKey, play]);

  return (
    <span ref={ref} className={styles.sticker} title={title} style={artTop ? ({ '--art-top': `${artTop}px` } as CSSProperties) : undefined}>
      {interactive ? (
        <button
          type="button"
          className={styles.stickerButton}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            play();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={(e) => measure(e.currentTarget)}
            onError={() => (src === thumb ? onFailed?.() : rest())}
          />
        </button>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={label} draggable={false} onLoad={(e) => measure(e.currentTarget)} onError={() => onFailed?.()} />
      )}
    </span>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { artTopOf, prefersStill, stickerBlob, stickerPlayback } from '@/lib/chat/stickerPlayback';
import { stickerArtTop, stickerFitTransform, stickerQuoteFit, stickerTrim } from '@/lib/chat/stickerBox';
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
 * the page, 128 on a phone, 144 wider, on its sender's side. It lays out by its
 * drawing, not its square (round 24, the owner's): its box is the drawing's
 * height with 2 % over and under it (`stickerTrim`), the square drawn whole
 * past it where it is transparent, so no empty paper stands over the puppet —
 * a tap, a hold and the chip all take that box (answering a quote, less the
 * band it rises over the quote, which is the quote's). It plays its two
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
  // Its layout box: the drawing's, by the catalog's numbers (a sticker this build doesn't know keeps its square).
  const trim = stickerTrim(known?.box);
  // Where its key frame's drawing starts in that box (a fraction of the side): a sticker answering a quote comes up
  // over it by its drawing. The catalog says so; for a later pack it is read from its loaded key frame.
  const [measuredArt, setMeasuredArt] = useState(0);
  const artTop = known ? stickerArtTop(known.box, known.poseBox) : measuredArt;
  const measure = (img: HTMLImageElement) => {
    if (!known && img.src.includes('.thumb.')) setMeasuredArt(artTopOf(img));
  };
  const boxStyle = {
    '--sticker-trim-top': trim.top,
    '--sticker-trim-h': trim.height,
    '--sticker-art': artTop,
  } as CSSProperties;
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
    <span ref={ref} className={styles.sticker} title={title} style={boxStyle}>
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

/**
 * A sticker standing small for its message — the quote a reply carries in the thread, the composer's reply row
 * (round 24, the owner's: 點點 stood under the half of its frame): its key frame drawn so the drawing at rest is
 * centred in the frame and as large as 92 % of it (`stickerQuoteFit`), never smaller than its square drawn whole.
 * The frame (`className`) gives the size and clips what lies past it, which is only the key frame's transparent
 * paper.
 */
export function QuotedSticker({ sticker, className }: { sticker: StickerRef; className: string }) {
  const transform = stickerFitTransform(stickerQuoteFit(stickerOf(sticker.pack, sticker.id)?.poseBox));
  return (
    <span className={className} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={stickerPath(sticker, 'thumb')} alt="" draggable={false} style={transform ? { transform } : undefined} />
    </span>
  );
}

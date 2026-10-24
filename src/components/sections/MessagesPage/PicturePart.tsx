'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { localPicture } from '@/lib/chat/localPictures';
import { chatImageUrl } from '@/lib/db/firestore/client/messages';
import type { MessageImage } from '@/lib/db/types';
import styles from './Thread.module.css';

/** A picture's place in a bubble: as wide as it may be, never taller than this. */
export const PICTURE_MAX_W = 280;
export const PICTURE_MAX_H = 340;

/**
 * The box a picture of this size takes in a bubble, known before it loads (so
 * the thread never jumps): its shape clamped between 1:2 and 2:1 — a longer
 * one is cut to that, whole in the viewer — at most PICTURE_MAX_W wide and
 * PICTURE_MAX_H tall. A picture with no size is drawn square.
 */
export function pictureBox(width: number, height: number): { w: number; h: number } {
  const aspect = width > 0 && height > 0 ? Math.min(2, Math.max(0.5, width / height)) : 1;
  const w = Math.min(PICTURE_MAX_W, PICTURE_MAX_H * aspect);
  return { w: Math.round(w), h: Math.round(w / aspect) };
}

/**
 * A picture sent in the thread, edge to edge inside its bubble (whose wobble
 * cuts it): from the device when it was sent from this page, else the
 * thread's size read with the session cookie (GET /api/v1/chat-images/{id},
 * only once the session is there to name the reader). Its place is the
 * paper-dark fill until it comes, and stays so with a picture glyph if it
 * doesn't — a tap tries it again. A tap on the picture opens it whole.
 */
export function PicturePart({ image, interactive }: { image: MessageImage; interactive: boolean }) {
  const t = useTranslations('messages');
  const { sessionReady } = useAuth();
  const local = localPicture(image.id);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const { w, h } = pictureBox(image.width, image.height);
  const remote = sessionReady ? chatImageUrl(image.id, 'thumb') : null;
  const src = local ?? (remote && attempt ? `${remote}&try=${attempt}` : remote);
  return (
    <>
      <button
        type="button"
        className={styles.sentPicture}
        style={{ aspectRatio: `${w} / ${h}` }}
        aria-label={t('openImage')}
        tabIndex={interactive ? undefined : -1}
        data-failed={failed || undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (!interactive) return;
          if (failed) {
            setFailed(false);
            setAttempt((a) => a + 1);
          } else setOpen(true);
        }}
      >
        {src && !failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} />
        )}
        {failed && (
          <span className={styles.sentPictureGlyph}>
            <Icon name="image" size={22} />
          </span>
        )}
      </button>
      {open && <PictureViewer image={image} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The picture whole, over everything: dark around it, fitted to the window.
 * The backdrop, Escape or the close put it away, and the focus goes back where
 * it was.
 */
export function PictureViewer({ image, onClose }: { image: MessageImage; onClose: () => void }) {
  const t = useTranslations('messages');
  const tNative = useTranslations('native');
  const back = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      back.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  const src = localPicture(image.id) ?? chatImageUrl(image.id, 'full');
  return createPortal(
    <div ref={dialog} className={styles.viewer} role="dialog" aria-modal="true" aria-label={t('openImage')} onClick={onClose}>
      <span className={styles.viewerClose}>
        <BareIconButton icon="close" label={tNative('close')} iconSize={22} tip={false} onClick={onClose} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.viewerPicture} src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

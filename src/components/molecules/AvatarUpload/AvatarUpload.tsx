'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  HandDrawnAvatar,
  avatarWobPath,
} from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { useToast } from '@/components/providers/ToastProvider';
import { uploadImageFile } from '@/lib/images/upload';
import { loadCropSource, releaseCropSource, type CropSource } from '@/lib/images/avatarCropImage';
import { AvatarCropModal } from './AvatarCropModal';
import styles from './AvatarUpload.module.css';

export interface AvatarUploadProps {
  /** current avatar image URL (if any) */
  src?: string;
  /** initials fallback shown when no image is set */
  initials: string;
  accentColor?: string;
  size?: number;
  seed?: number;
  /**
   * Called with the public R2 URL once the framed photo is stored. May return
   * the save's promise: a rejection puts the old photo back and says so.
   */
  onUploaded: (url: string) => void | Promise<void>;
}

// Any picture the browser can read: the crop dialog decodes it (or says it can't) and sends a JPEG square.
const ACCEPT = 'image/*';

/**
 * A large, click- or drag-to-upload avatar block for the profile editor. The
 * avatar itself is the dropzone: hovering reveals a "change" overlay, dragging
 * highlights it. A picture chosen or dropped opens the crop dialog (B7) —
 * framed there, then sent as a square through the card image upload's path
 * (uploadImageFile → /api/upload → R2, `purpose: 'avatar'`); the dialog shows
 * the progress and any failure.
 */
export function AvatarUpload({
  src,
  initials,
  accentColor,
  size = 120,
  seed = 77,
  onUploaded,
}: AvatarUploadProps) {
  const t = useTranslations('settings.profile');
  const tNative = useTranslations('native');
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The framed photo on its way (round 21): drawn at once, from this browser, until the saved one takes over.
  const [uploading, setUploading] = useState<string | null>(null);
  const toast = useToast();

  // The decoded picture's pixels go when the dialog closes (or the page does).
  useEffect(() => () => {
    if (source) releaseCropSource(source);
  }, [source]);

  // Clip the hover/upload wash to the avatar's exact wobbly outline so the dark
  // overlay follows the hand-drawn curve instead of leaking past it.
  const clipPath = useMemo(
    () => `path('${avatarWobPath(size, seed)}')`,
    [size, seed]
  );

  /** A chosen or dropped picture: decoded for the crop dialog, or said to be unreadable. */
  async function open(file: File) {
    if (source) return;
    setError(null);
    try {
      setSource(await loadCropSource(file));
    } catch {
      setError(t('avatarOpenError'));
    }
  }

  /**
   * The framed square, used at once (round 21): the dialog closes and the avatar shows it, the pen loop on it,
   * while it is stored (the server scales a profile photo to 256 px) and saved by the caller. A failure puts the
   * old photo back and says so in a toast whose 再試一次 sends the same square again.
   */
  function send(blob: Blob) {
    const local = URL.createObjectURL(blob);
    setUploading(local);
    setSource(null);
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    uploadImageFile(file, { purpose: 'avatar' })
      .then(({ publicUrl }) => onUploaded(publicUrl))
      .then(
        () => setUploading(null),
        () => {
          setUploading(null);
          toast.show({ message: t('avatarError'), action: { label: tNative('retry'), ariaLabel: tNative('retry'), icon: 'restore', onAction: () => send(blob) } });
        },
      )
      .finally(() => URL.revokeObjectURL(local));
  }

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.dropzone}
        style={{ width: size, height: size }}
        data-drag={dragOver || undefined}
        aria-label={src ? t('avatarChange') : t('avatarAdd')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void open(file);
        }}
      >
        <HandDrawnAvatar
          src={uploading ?? src}
          initials={initials}
          color={accentColor}
          size={size}
          seed={seed}
        />
        <span
          className={styles.overlay}
          style={{ clipPath, WebkitClipPath: clipPath }}
          data-uploading={uploading ? '' : undefined}
          aria-hidden="true"
        >
          {uploading ? <ButtonLoader size={26} /> : <Icon name="image" size={26} color="var(--photo-ink)" />}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className={styles.fileInputHidden}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void open(file);
          e.currentTarget.value = '';
        }}
      />

      <div className={styles.meta}>
        <span className={styles.label}>{t('avatar')}</span>
        <span className={styles.hint}>{t('avatarHint')}</span>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>

      <AvatarCropModal source={source} onCancel={() => setSource(null)} onUse={send} />
    </div>
  );
}

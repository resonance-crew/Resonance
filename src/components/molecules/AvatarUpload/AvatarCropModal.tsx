'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { CropStage, type StagePicture } from '@/components/molecules/CropStage/CropStage';
import { avatarWobPath } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { CROP_MASK_INSET, CROP_START, CROP_ZOOM_MAX, cropRect, type CropView } from '@/lib/images/avatarCrop';
import { renderCrop, type CropSource } from '@/lib/images/avatarCropImage';
import styles from './AvatarCropModal.module.css';

export interface AvatarCropModalProps {
  /** The decoded picture; the modal is open while there is one. */
  source: CropSource | null;
  /** Cancel, the backdrop or Escape (none of them while the photo is on its way). */
  onCancel: () => void;
  /**
   * The framed square (a JPEG). The avatar uses it at once and closes this (round 21: it goes up behind the
   * dialog); a caller that returns a promise keeps the dialog waiting on it, and a rejection is said here.
   */
  onUse: (blob: Blob) => void | Promise<void>;
}

/** The avatar's shape (HandDrawnAvatar's seed in settings). */
const MASK_SEED = 77;
/** The stage at its widest (round 25 §G3.1, up from 320). */
const AVATAR_STAGE_MAX = 400;
const avatarOutline = (d: number) => avatarWobPath(d, MASK_SEED);

/**
 * Framing a new profile photo before it goes up (round 5, B7) — our own
 * dialog, the same on the web and in both apps: the shared crop stage
 * (molecules/CropStage, round 25 §G3) under the avatar's own outline; what
 * shows inside the outline is exactly the avatar. 使用 crops the square,
 * uploads it and saves it (the caller's `onUse`), its loader running
 * meanwhile; Cancel leaves everything as it was.
 */
export function AvatarCropModal({ source, onCancel, onUse }: AvatarCropModalProps) {
  const t = useTranslations('settings.profile');
  const [view, setView] = useState<CropView>(CROP_START);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new picture starts unzoomed and centred.
  useEffect(() => {
    setView(CROP_START);
    setBusy(false);
    setFailed(false);
  }, [source]);

  const picture = useMemo<StagePicture | null>(() => (source ? { el: source.canvas, width: source.width, height: source.height } : null), [source]);
  const onView = useCallback((update: (v: CropView) => CropView) => setView(update), []);

  async function use() {
    if (!source || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // the view is in frame widths: avatarCrop's own maths at a mask of 1
      await onUse(await renderCrop(source, cropRect({ width: source.width, height: source.height }, 1, view)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={source != null} onClose={busy ? undefined : onCancel} maxWidth={AVATAR_STAGE_MAX + 64} seed={59} ariaLabel={t('cropTitle')}>
      <h3 className={styles.title}>{t('cropTitle')}</h3>
      <p className={styles.hint}>{t('cropHint')}</p>

      <CropStage
        picture={picture}
        ratio={1}
        max={AVATAR_STAGE_MAX}
        inset={CROP_MASK_INSET}
        zoomMax={CROP_ZOOM_MAX}
        outline={avatarOutline}
        view={view}
        onView={onView}
        label={t('cropStage')}
        busy={busy}
      />

      {failed && (
        <p className={`${modalStyles.error} ${styles.error}`} role="alert">
          {t('avatarError')}
        </p>
      )}

      <div className={styles.foot}>
        <ModalActions busy={busy}>
          <OrganicButton variant="tonal" size="sm" onClick={onCancel} disabled={busy}>
            {t('cropCancel')}
          </OrganicButton>
          <OrganicButton variant="solid" size="sm" onClick={() => void use()} loading={busy} workingLabel={t('cropUseShort')}>
            {t('cropUse')}
          </OrganicButton>
        </ModalActions>
      </div>
    </Modal>
  );
}

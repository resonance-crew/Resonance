'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { CropStage, type StagePicture } from '@/components/molecules/CropStage/CropStage';
import { wobRect } from '@/lib/design/wobRect';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { CROP_START, type CropView } from '@/lib/images/avatarCrop';
import { COVER_FRAME_LIMITS, type CoverFrame } from '@/lib/images/coverFrame';
import { coverFrameOfView, viewOfCoverFrame } from '@/lib/images/cropFrame';
import styles from './PublishStep.module.css';

/** The feed card's cover shape (StoryCard's 0.62): the frame the dialog shows. */
export const COVER_FRAME_RATIO = 0.62;
/** The stage at its widest (round 25 §G3.1), and the dimmed picture round the frame. */
export const COVER_STAGE_MAX = 480;
const COVER_INSET = 20;
/** The cover's own outline (OrganicImage's recipe at the feed card's size). */
const coverOutline = (w: number, h: number) =>
  wobRect(w, h, 18, 23, Math.min(w, h) * 0.025, { segmentsH: [3, 4], segmentsV: [2, 3], curve: 0.4, cornerJitter: 1.1, cornerOffset: 3 });

/** A cover's picture, loaded for the stage (it is already up: nothing is uploaded again). */
export async function loadCoverPicture(url: string): Promise<StagePicture> {
  const img = new Image();
  img.decoding = 'async';
  img.alt = '';
  img.src = url;
  if (typeof img.decode === 'function') await img.decode();
  else await new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = () => rej(new Error('cover')))));
  return { el: img, width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
}

/**
 * 調整封面 / Frame the cover (round 25 §G2): the picture under a frame in the feed card's shape (0.62, the cover's
 * own outline), dimmed outside it — the shared crop stage the profile photo uses (§G3). 完成 hands back the frame
 * (`media.frame`), which the draft keeps; nothing is uploaded. Cancel leaves the cover as it was.
 */
export function CoverFrameModal({
  picture,
  frame,
  onCancel,
  onDone,
}: {
  /** The loaded picture; the dialog is open while there is one. */
  picture: StagePicture | null;
  frame: CoverFrame | null | undefined;
  onCancel: () => void;
  onDone: (frame: CoverFrame | undefined) => void;
}) {
  const t = useTranslations('write.coverFrame');
  const touch = useMediaQuery('(pointer: coarse)');
  const [view, setView] = useState<CropView>(CROP_START);
  // The dialog opens on the frame the cover has.
  useEffect(() => {
    if (picture) setView(viewOfCoverFrame(picture, COVER_FRAME_RATIO, frame));
    // only when a picture is put on the stage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture]);
  const onView = useCallback((update: (v: CropView) => CropView) => setView(update), []);

  function done() {
    if (!picture) return;
    const moved = Math.abs(view.z - 1) > 1e-3 || Math.abs(view.ox) > 1e-4 || Math.abs(view.oy) > 1e-4;
    // back at the start: the centre, as a cover with no frame is drawn
    onDone(moved ? coverFrameOfView(picture, COVER_FRAME_RATIO, view) : undefined);
  }

  return (
    <Modal open={picture != null} onClose={onCancel} maxWidth={COVER_STAGE_MAX + 64} seed={61} ariaLabel={t('title')}>
      <h3 className={styles.frameTitle}>{t('title')}</h3>
      <p className={styles.frameHint}>{touch ? t('hintTouch') : t('hintPointer')}</p>
      <CropStage
        picture={picture}
        ratio={COVER_FRAME_RATIO}
        max={COVER_STAGE_MAX}
        inset={COVER_INSET}
        zoomMax={COVER_FRAME_LIMITS.zoom.max}
        outline={coverOutline}
        view={view}
        onView={onView}
        label={t('stage')}
      />
      <div className={styles.frameFoot}>
        <ModalActions>
          <OrganicButton variant="tonal" size="sm" onClick={onCancel}>
            {t('cancel')}
          </OrganicButton>
          <OrganicButton variant="solid" size="sm" onClick={done}>
            {t('done')}
          </OrganicButton>
        </ModalActions>
      </div>
    </Modal>
  );
}

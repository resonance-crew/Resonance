'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { useRestoredAloneNotice } from '@/lib/data/trash';
import styles from '@/components/molecules/CardActionsMenu/CardActionsMenu.module.css';

/**
 * 「已還原 — 這張卡片回來了，但不再與原本那張卡片共振」: a resonance restored
 * from the trash that came back on its own (another of the viewer's cards
 * answers its original now, or the original answers it). One way out, as a
 * refused change's notice has. Drawn once by each page that can restore a
 * card (the card box, a card's page, the writer); whichever control restored
 * it may be gone by then (lib/data/trash).
 */
export function RestoredAloneNotice({ seed = 17 }: { seed?: number }) {
  const t = useTranslations('me.actions');
  const [open, close] = useRestoredAloneNotice();
  return (
    <Modal open={open} onClose={close} seed={seed} maxWidth={400} ariaLabel={t('restored')} closeButton>
      <h3 className={styles.noticeTitle}>{t('restored')}</h3>
      <p className={styles.notice}>{t('restoredAloneBody')}</p>
    </Modal>
  );
}

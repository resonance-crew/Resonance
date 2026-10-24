'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Modal } from '@/components/molecules/Modal/Modal';
import { CardPickList } from '@/components/molecules/CardPicker/CardPickList';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import type { Card } from '@/lib/db/types';
import styles from './InsertCardModal.module.css';

export interface InsertCardModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen card; the caller inserts the link and closes. */
  onPick: (card: Card) => void;
  /** Override the heading (e.g. the DM「分享卡片」context vs. editor insert). */
  title?: string;
  /** Override the subtitle line. */
  subtitle?: string;
}

/** The author's cards as the picker holds them: being read, read, or a read that failed. */
type Shelf = { status: 'loading' } | { status: 'ready'; cards: Card[] } | { status: 'failed' };

/**
 * Picker for the author's own published public cards. Used both by the editor's
 * "insert card link" action and by the DM composer's "share a card" — the
 * caller supplies the copy and decides what to do with the pick. Public-only
 * because the reference lands somewhere the recipient can open.
 *
 * While the cards are read the rows' footprint stands where they will (round 9
 * C2); a read that fails says so, with 再試一次 — never "no cards".
 */
export function InsertCardModal({ open, onClose, onPick, title, subtitle }: InsertCardModalProps) {
  const t = useTranslations('write.editor.cardModal');
  const { user } = useAuth();
  const uid = user?.id;
  const [shelf, setShelf] = useState<Shelf>({ status: 'loading' });
  // Each 再試一次 reads again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !uid) return;
    let alive = true;
    setShelf((was) => (was.status === 'loading' ? was : { status: 'loading' }));
    getCardsByAuthor(uid, 'published')
      .then((list) => alive && setShelf({ status: 'ready', cards: list.filter((c) => c.visibility === 'public') }))
      .catch(() => alive && setShelf({ status: 'failed' }));
    return () => {
      alive = false;
    };
  }, [open, uid, attempt]);

  const heading = title ?? t('title');

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={480}
      seed={53}
      padding="26px 24px 22px"
      ariaLabel={heading}
      // A pick is the action; the way out lies at the foot.
      closeButton
      closeLabel={t('cancel')}
    >
      <h3 className={styles.title}>{heading}</h3>
      <p className={styles.subtitle}>{subtitle ?? t('subtitle')}</p>

      <CardPickList
        cards={shelf.status === 'ready' ? shelf.cards : []}
        loading={shelf.status === 'loading'}
        onPick={onPick}
        empty={
          shelf.status === 'failed' ? (
            <div className={styles.failed} role="alert">
              <span>{t('failed')}</span>
              <OrganicButton variant="tonal" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t('retry')}
              </OrganicButton>
            </div>
          ) : (
            t('empty')
          )
        }
      />

    </Modal>
  );
}

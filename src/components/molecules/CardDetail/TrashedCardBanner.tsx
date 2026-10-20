'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { Panel } from '@/components/molecules/Panel/Panel';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import { daysLeft, purgeAtOf } from '@/lib/cards/trash';
import { announceRestoredAlone, useTrashActions } from '@/lib/data/trash';
import { ApiError } from '@/lib/db/firestore/client/api';
import type { Card } from '@/lib/db/types';
import styles from './TrashedCardBanner.module.css';

export interface TrashedCardBannerProps {
  /** The owner's card, in the trash (`trashedAt` set). */
  card: Pick<Card, 'id' | 'slug' | 'trashedAt' | 'trashedFrom' | 'anonymous' | 'publishedAt'>;
  /** It was moved to the trash on this very page a moment ago: focus comes to the banner's title. */
  focusTitle?: boolean;
}

/**
 * 「這張卡片在垃圾桶裡」 — what the owner sees at the head of their card's
 * page while it is in the trash (from the shelf, a bell, a link, or the
 * page's own 刪除, which leaves them here): how long it has and that only
 * they can see it, and that an anonymous card's notes went with it; then
 * 還原 (the card comes back here, as it was) and 永久刪除 (asked first, in
 * red, then back to the card box). Everyone else gets the page's not-found.
 */
export function TrashedCardBanner({ card, focusTitle = false }: TrashedCardBannerProps) {
  const t = useTranslations('card.trashed');
  const tActions = useTranslations('me.actions');
  const tMe = useTranslations('me');
  const tSafety = useTranslations('safety');
  const router = useRouter();
  const toast = useToast();
  const actions = useTrashActions();
  const title = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<'restore' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (focusTitle) title.current?.focus();
  }, [focusTitle]);

  const ref = { id: card.id, slug: card.slug, referenceCardId: card.trashedFrom?.referenceCardId ?? undefined };
  const left = card.trashedAt ? daysLeft(purgeAtOf(card.trashedAt)) : null;
  const days = left ? (left.lastDay ? tMe('trashLastDay') : tMe('trashDaysLeft', { count: left.days })) : null;

  async function restore() {
    if (busy) return;
    setBusy('restore');
    try {
      // The page reads the card again (useTrashActions): the banner goes with the trash.
      const { droppedResonance } = await actions.restore(ref);
      if (droppedResonance) announceRestoredAlone();
      else toast.show({ message: tActions('restored') });
    } catch {
      toast.show({ message: tActions('undoFailed') });
    } finally {
      setBusy(null);
    }
  }

  async function deleteForever() {
    if (busy) return;
    setBusy('delete');
    setFailed(false);
    try {
      await actions.deleteForever(ref);
      setConfirming(false);
      toast.show({ message: tActions('deletedForever') });
      router.replace('/me');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        // Restored meanwhile (another device): it stays, and the page shows it as it is.
        setConfirming(false);
        toast.show({ message: tActions('notInTrash') });
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel variant="soft" className={styles.banner}>
      <div className={styles.row}>
        <span className={styles.glyph}>
          <Icon name="trash" size={20} />
        </span>
        <div className={styles.text}>
          {/* Not a heading: it comes before the card's own title (the page's h1). */}
          <p ref={title} className={styles.title} tabIndex={-1}>
            {t('title')}
          </p>
          <p className={styles.caption}>{days ? `${days} · ${t('onlyYou')}` : t('onlyYou')}</p>
          {card.anonymous === true && card.publishedAt && <p className={styles.caption}>{t('notesGone')}</p>}
        </div>
        <div className={styles.actions}>
          <OrganicButton variant="solid" size="sm" onClick={() => void restore()} loading={busy === 'restore'} disabled={busy !== null}>
            {tActions('restore')}
          </OrganicButton>
          <OrganicButton
            variant="dangerTonal"
            size="sm"
            onClick={() => {
              setFailed(false);
              setConfirming(true);
            }}
            disabled={busy !== null}
          >
            {tActions('deleteForever')}
          </OrganicButton>
        </div>
      </div>
      <ConfirmModal
        open={confirming}
        title={tActions('deleteForeverConfirmTitle')}
        body={tActions('deleteConfirmBody')}
        cancelLabel={tActions('deleteCancel')}
        confirmLabel={tActions('deleteForever')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void deleteForever()}
        busy={busy === 'delete'}
        destructive
        error={failed ? tSafety('actionError') : null}
        seed={71}
      />
    </Panel>
  );
}

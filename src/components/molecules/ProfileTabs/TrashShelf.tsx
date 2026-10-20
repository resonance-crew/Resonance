'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { CARD_HUES } from '@/components/molecules/StoryCard/StoryCard';
import { TrashActionsMenu } from '@/components/molecules/TrashActionsMenu/TrashActionsMenu';
import { TRASH_DAYS, daysLeft, purgeAtOf } from '@/lib/cards/trash';
import { useTrashActions, type TrashCardRef } from '@/lib/data/trash';
import type { Card, User } from '@/lib/db/types';
import styles from './TrashShelf.module.css';

export interface TrashShelfProps {
  cards: Card[];
  authors: Record<string, User>;
  /** A card left the shelf: restored, or deleted for good (focus moves on from it). */
  onLeft?: (id: string) => void;
}

/**
 * The card box's 垃圾桶: what the viewer deleted, the latest in first, for
 * 30 days — each saying where it came from (a draft, private, or what
 * restoring makes it: 還原後公開 — a restore never re-publishes in silence)
 * and when it goes. A published card opens its page (its trash banner), a
 * draft the writer (its trashed notice). Its ⋯ restores it or deletes it for
 * good; 清空垃圾桶 deletes them all, asked first in red.
 */
export function TrashShelf({ cards, authors, onLeft }: TrashShelfProps) {
  const t = useTranslations('me');
  const tActions = useTranslations('me.actions');
  const tSafety = useTranslations('safety');
  const actions = useTrashActions();
  const [emptying, setEmptying] = useState<'asking' | 'busy' | null>(null);
  const [failed, setFailed] = useState(false);

  if (!cards.length) {
    return <EmptyState icon="trash" seed={61} title={t('emptyTrash')} line={t('emptyTrashLine', { days: TRASH_DAYS })} />;
  }

  // Notes on an anonymous card went with it into the trash: said while one is here.
  const anonymousHere = cards.some((c) => c.anonymous === true && c.publishedAt);
  const now = Date.now();
  const caption = (c: Card) => {
    const from = !c.publishedAt
      ? t('trashFrom.draft')
      : t(`trashFrom.${c.trashedFrom?.visibility ?? 'private'}`);
    const left = c.trashedAt ? daysLeft(purgeAtOf(c.trashedAt), now) : null;
    const days = !left ? null : left.lastDay ? t('trashLastDay') : t('trashDaysLeft', { count: left.days });
    return <span className={styles.caption}>{days ? `${from} · ${days}` : from}</span>;
  };
  const ref = (c: Card): TrashCardRef => ({ id: c.id, slug: c.slug, referenceCardId: c.trashedFrom?.referenceCardId ?? undefined });

  async function empty() {
    setEmptying('busy');
    setFailed(false);
    try {
      await actions.emptyTrash();
      setEmptying(null);
    } catch {
      // What is left is read again (useTrashActions), and the question stays to try once more.
      setFailed(true);
      setEmptying('asking');
    }
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.lines}>
          <p className={styles.hint}>{t('trashHint', { days: TRASH_DAYS })}</p>
          {anonymousHere && <p className={styles.hint}>{t('trashAnonymousNotes')}</p>}
        </div>
        {/* It only opens a question, which is red: the tonal red, as Settings' 刪除帳號. */}
        <OrganicButton
          variant="dangerTonal"
          size="sm"
          onClick={() => {
            setFailed(false);
            setEmptying('asking');
          }}
        >
          {tActions('emptyTrash')}
        </OrganicButton>
      </div>
      <CardLinkGrid
        cards={cards}
        authors={authors}
        // Never prefilled: a summary isn't the card.
        cardHref={(c) => (c.publishedAt ? `/card/${c.slug ?? c.id}` : `/write/${c.id}`)}
        renderCaption={caption}
        renderActions={(c, _i, palette) => {
          const hue = CARD_HUES[palette];
          return <TrashActionsMenu card={ref(c)} seed={hue} hue={hue} onRestored={(r) => onLeft?.(r.id)} onDeleted={onLeft} />;
        }}
      />
      <ConfirmModal
        open={emptying !== null}
        title={tActions('emptyTrashTitle')}
        body={tActions('emptyTrashBody')}
        cancelLabel={tActions('deleteCancel')}
        confirmLabel={tActions('emptyTrash')}
        onCancel={() => setEmptying(null)}
        onConfirm={() => void empty()}
        busy={emptying === 'busy'}
        destructive
        error={failed ? tSafety('actionError') : null}
        seed={67}
      />
    </>
  );
}

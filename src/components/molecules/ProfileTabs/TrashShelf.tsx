'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { CARD_HUES } from '@/components/molecules/StoryCard/StoryCard';
import { TrashActionsMenu } from '@/components/molecules/TrashActionsMenu/TrashActionsMenu';
import { TRASH_DAYS } from '@/lib/cards/trash';
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
 * 30 days (the hint over the shelf says so) — the cards alone, no line under
 * them (round 11 §7): restoring one says which shelf it went back to (a
 * public one is public again — never in silence). Every card opens its page
 * (its trash banner), a 私人卡 never published too. Its ⋯ restores it or
 * deletes it for good; 清空 deletes them all, asked first in red.
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
      {/* One row, no container (round 9 §5): the hint at the start, 🗑 清空 at the end — on every width, the
          action centred on the lines, which wrap. A filled shape under the shelf picker would read as a field. */}
      <div className={styles.header}>
        <div className={styles.lines}>
          <p className={styles.hint}>{t('trashHint', { days: TRASH_DAYS })}</p>
          {anonymousHere && <p className={styles.hint}>{t('trashAnonymousNotes')}</p>}
        </div>
        {/* It only opens a question, which is red: its words in the danger ink, its name the whole of it. */}
        <OrganicButton
          variant="dangerText"
          size="sm"
          className={styles.empty}
          ariaLabel={tActions('emptyTrash')}
          onClick={() => {
            setFailed(false);
            setEmptying('asking');
          }}
        >
          <Icon name="trash" size={16} />
          {tActions('emptyTrashShort')}
        </OrganicButton>
      </div>
      <CardLinkGrid
        cards={cards}
        authors={authors}
        // Its page, with its trash banner — a 私人卡 never published too (round 9 §1). Never prefilled: a
        // summary isn't the card.
        cardHref={(c) => `/card/${c.slug ?? c.id}`}
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

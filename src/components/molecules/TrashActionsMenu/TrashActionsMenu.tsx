'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useToast } from '@/components/providers/ToastProvider';
import { ApiError } from '@/lib/db/firestore/client/api';
import { RESTORED_TOAST, announceRestoredAlone, restoredAs, useTrashActions, type TrashCardRef } from '@/lib/data/trash';

export interface TrashActionsMenuProps {
  card: TrashCardRef;
  seed?: number;
  /** The accent hue of the card (the menu rides the theme terracotta without it). */
  hue?: number;
  /** After it came back (the shelf it returns to is read again already). */
  onRestored?: (card: TrashCardRef) => void;
  /** After it was deleted for good. */
  onDeleted?: (id: string) => void;
}

/**
 * The ⋯ on a card in the trash: 還原 (it comes back as it was, saying who
 * reads it now: 已還原為私人卡 / 公開卡片 / …) and 永久刪除 (asked first, in red: it can't be undone). The
 * delete keeps to the trash (`onlyIfTrashed`): a card restored meanwhile,
 * on another device, is not deleted — the shelf is read again and says so.
 */
export function TrashActionsMenu({ card, seed = 7, hue, onRestored, onDeleted }: TrashActionsMenuProps) {
  const t = useTranslations('me.actions');
  const tSafety = useTranslations('safety');
  const toast = useToast();
  const actions = useTrashActions();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  const items: OrganicMenuItem[] = [
    { key: 'restore', icon: 'restore', label: t('restore') },
    { key: 'deleteForever', icon: 'trash', label: t('deleteForever'), danger: true },
  ];

  async function restore() {
    setBusy(true);
    try {
      const { card: restored, droppedResonance } = await actions.restore(card);
      if (droppedResonance) announceRestoredAlone();
      else toast.show({ message: t(RESTORED_TOAST[restoredAs(restored)]) });
      onRestored?.(card);
    } catch {
      toast.show({ message: t('undoFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function deleteForever() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await actions.deleteForever(card);
      setConfirming(false);
      toast.show({ message: t('deletedForever') });
      onDeleted?.(card.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        // Restored meanwhile (another device): it stays, and the shelf now shows where it is.
        setConfirming(false);
        toast.show({ message: t('notInTrash') });
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OrganicMenu
        items={items}
        onChoose={(key) => {
          if (busy) return;
          if (key === 'restore') void restore();
          else {
            setFailed(false);
            setConfirming(true);
          }
        }}
        label={t('menuLabel')}
        seed={seed}
        hue={hue}
        busy={busy}
      />
      {/* For good: the verb in red. A refusal is said in the dialog, which stays to try again. */}
      <ConfirmModal
        open={confirming}
        title={t('deleteForeverConfirmTitle')}
        body={t('deleteConfirmBody')}
        cancelLabel={t('deleteCancel')}
        confirmLabel={t('deleteForever')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void deleteForever()}
        busy={busy}
        destructive
        error={failed ? tSafety('actionError') : null}
        seed={seed + 5}
      />
    </>
  );
}

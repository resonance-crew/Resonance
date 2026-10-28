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
  /** As it leaves the shelf for good (at once, before the server answers: it comes back should the server refuse). */
  onLeaving?: (id: string) => void;
}

/**
 * The ⋯ on a card in the trash: 還原 (it comes back as it was, saying who
 * reads it now: 已還原為私人卡 / 公開卡片 / …) and 永久刪除 (asked first, in red: it can't be undone). The
 * delete keeps to the trash (`onlyIfTrashed`): a card restored meanwhile,
 * on another device, is not deleted — the shelf is read again and says so.
 */
export function TrashActionsMenu({ card, seed = 7, hue, onRestored, onLeaving }: TrashActionsMenuProps) {
  const t = useTranslations('me.actions');
  const toast = useToast();
  const actions = useTrashActions();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  // The card leaves its shelf at once (and this menu, its question, with it: useTrashActions); what the server
  // answers is said in a toast, which outlives them — a refusal brings the card back.
  async function deleteForever() {
    if (busy) return;
    setBusy(true);
    onLeaving?.(card.id);
    try {
      await actions.deleteForever(card);
      setConfirming(false);
      toast.show({ message: t('deletedForever') });
    } catch (e) {
      setConfirming(false);
      // Restored meanwhile (another device): it stays, and the shelf now shows where it is.
      toast.show({ message: t(e instanceof ApiError && e.code === 'conflict' ? 'notInTrash' : 'deleteForeverFailed') });
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
          else setConfirming(true);
        }}
        label={t('menuLabel')}
        seed={seed}
        hue={hue}
        busy={busy}
      />
      {/* For good: the verb in red. */}
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
        seed={seed + 5}
      />
    </>
  );
}

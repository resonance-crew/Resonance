'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import { TRASH_DAYS } from '@/lib/cards/trash';
import { useCardSummaries } from '@/lib/data/hooks';
import { useConnectionRefresh, useResonanceRefresh } from '@/lib/data/resonate';
import { announceRestoredAlone, useTrashActions, type TrashCardRef } from '@/lib/data/trash';
import { unresonate, updateCardSettings } from '@/lib/db/firestore/client/cards';
import type { Card, Visibility } from '@/lib/db/types';

export interface CardActionsMenuProps {
  /**
   * `referenceCardId`: the card it resonates with, which adds「取消共振」.
   * `title`: what the undo toast names. `published` and `anonymous`: whether
   * moving it to the trash takes back a resonance that may be what connects
   * the viewer with its original's author — the one 刪除 that asks first.
   * Only a card readers have is offered 轉為私人卡: a 私人卡 (a draft, or a
   * published card kept private) is published from the writer's step.
   */
  card: {
    id: string;
    visibility: Visibility;
    slug?: string;
    referenceCardId?: string;
    title?: string;
    published?: boolean;
    anonymous?: boolean;
  };
  /**
   * The title of the card it resonates with, for the confirm's question;
   * looked up from the server when it is asked and this is left out.
   */
  referenceTitle?: string;
  /**
   * Whether the card it resonates with is anonymous (the card page knows it
   * from the card itself): looked up from the server when 刪除 needs it and
   * this is left out.
   */
  referenceAnonymous?: boolean;
  /**
   * What says the card went to the trash: the toast with its 復原 (the card
   * box, where the card leaves its shelf), or the page itself (the card's own
   * page, which stays and shows its trash banner — `onTrashed` reads it again).
   */
  trashFeedback?: 'toast' | 'page';
  /** Seed so the wobble of the trigger + dropped card is deterministic per card. */
  seed?: number;
  /** The accent hue of the card. If omitted, the menu rides the theme terracotta. */
  hue?: number;
  /** Called after the visibility changed (the card box and the viewer's profile lists are already read again). */
  onChanged?: () => void;
  /** Called after the card went to the trash (its lists are read again already). */
  onTrashed?: (id: string) => void;
  /**
   * The page's own copy of the card, changed at once (round 21: the card's page — its trash banner, its
   * 🔒, its link to the original show before the server answers); returns what puts it back as it was.
   */
  patchCard?: (patch: Partial<Card>) => () => void;
  /**
   * Called as the card leaves the card box's shelf for the trash: at once, before the server answers
   * (useTrashActions takes it off the shelves; a refusal brings it back). The toast's feedback only.
   */
  onLeaving?: (id: string) => void;
  /** Called after the toast's 復原 brought it back. */
  onRestored?: (card: TrashCardRef) => void;
  /** On the page's own paper (the card page's title row): see OrganicMenu's `bare`. */
  bare?: boolean;
  /**
   * The page beside it shows its own 編輯 (a 私人卡's card page, its pen): the ⋯ then leads with 公開發表
   * instead — the writer's publish step with 公開 chosen (round 12 §3) — so the page never says 編輯 twice.
   */
  editShown?: boolean;
  className?: string;
}

type ActionKey = 'edit' | 'publish' | 'visibility' | 'unresonate' | 'delete';

/**
 * The owner-side「⋯」menu on a card: 編輯 (公開發表 on a 私人卡's own page,
 * where its pen is 編輯) / 轉為私人卡 (a card readers have)
 * / 取消共振 (a card that resonates with another) / 刪除. The trigger and
 * dropped panel come from {@link OrganicMenu} (the one menu sheet — paper
 * inside the card's pen line, no dividers, per-row ink, 刪除 on its red wash); this
 * component owns only the card business logic. Changes go
 * through the server (PATCH /api/v1/cards/{id}, POST …/trash), which also
 * drops the cached pages that showed the card as it was and keeps the
 * recommender's copy in step; then the viewer's card box and profile lists
 * are read again, so the card visibly moves tabs / disappears without a
 * reload. A change refused (an error, a card the rules won't let go of) says
 * so and leaves the card where it was.
 *
 * 刪除 moves the card to the trash, where it waits 30 days: no dialog — the
 * toast's 復原 (or the page's banner) and the trash itself are the way back.
 * One case asks first, in the plain colour of 取消共振: a published resonance,
 * public and under the viewer's name, whose original is named — the trash
 * takes it back at once, and with it a connection only it held, which a
 * restore never brings back. Taking a resonance back, by hiding or trashing
 * it, can end the connection with the original's author: what turns on the
 * viewer's connections is read again too (lib/data/resonate).
 */
export function CardActionsMenu({
  card,
  referenceTitle,
  referenceAnonymous,
  trashFeedback = 'toast',
  seed = 7,
  hue,
  onChanged,
  onTrashed,
  patchCard,
  onLeaving,
  onRestored,
  bare = false,
  editShown = false,
  className,
}: CardActionsMenuProps) {
  const t = useTranslations('me.actions');
  const router = useRouter();
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const trashActions = useTrashActions();

  const refreshResonance = useResonanceRefresh();
  const refreshConnections = useConnectionRefresh();

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'trash' | 'unresonate' | null>(null);
  // 刪除 on a resonance whose original's byline is unknown: it is looked up before anything else happens.
  const [deciding, setDeciding] = useState(false);

  const original = card.referenceCardId;
  // What the trash takes back for good: a resonance that reached the original's author (public, named, published).
  const reachingResonance = !!original && !!card.published && card.visibility === 'public' && card.anonymous !== true;
  // The confirm asks「不再與〈title〉共振？」: the title is the page's when it
  // has it, else asked for once the question is (the plain words if it can't
  // be read) — and 刪除 asks it whether the original is anonymous.
  const lookup = useCardSummaries(
    original && ((confirming === 'unresonate' && !referenceTitle) || deciding) ? [original] : [],
  );
  const originalTitle =
    referenceTitle ?? (lookup?.status === 'ready' ? lookup.cards.cards.find((c) => c.id === original)?.thoughtCore : undefined);

  const isPrivate = card.visibility === 'private';
  // 轉為私人卡, on a card readers have: a 私人卡 — never published, or kept private — is published from the writer's step,
  // where its tags, cover and type are, so every 私人卡's ⋯ is the same (round 8 §1.2).
  const privateCard = card.published === false || isPrivate;
  const items: OrganicMenuItem[] = [
    editShown && privateCard ? { key: 'publish', icon: 'globe', label: t('publishPublicly') } : { key: 'edit', icon: 'pen', label: t('edit') },
    ...(privateCard ? [] : [{ key: 'visibility', icon: 'lock' as const, label: t('makePrivate') }]),
    ...(original ? [{ key: 'unresonate', icon: 'wave' as const, label: t('unresonate') }] : []),
    { key: 'delete', icon: 'trash', label: t('delete'), danger: true },
  ];

  // What this browser holds of the viewer's own cards: the card box's shelves, and
  // their profile's lists (profileCards: signed-out reads; profilePage: one
  // per profile they looked at, keyed by viewer). A resonance hidden was
  // taken back: what turns on their connections is read again in the same pass.
  const refreshOwnLists = useCallback(() => {
    if (!user) return;
    const uid = user.id;
    const own = (key: string) =>
      key.startsWith(`cardbox:${uid}:`) || key === `profileCards:${uid}` || (key.startsWith('profilePage:') && key.endsWith(`:${uid}`));
    if (original) refreshConnections(own);
    else void mutate((key) => typeof key === 'string' && own(key));
  }, [mutate, user, original, refreshConnections]);

  const ref: TrashCardRef = { id: card.id, slug: card.slug, referenceCardId: original };
  const title = card.title ?? '';

  // The toast's 復原: the card comes back as it was. This menu may be gone by
  // then (the card left its shelf): only what outlives it is used here.
  const undo = async () => {
    try {
      const { droppedResonance } = await trashActions.restore(ref);
      if (droppedResonance) announceRestoredAlone();
      else toast.show({ message: t('restored') });
      onRestored?.(ref);
    } catch {
      toast.show({ message: t('undoFailed') });
    }
  };

  // Round 21: the card goes at once and any question with it — in the card box it leaves its shelf (and this
  // menu with it), on its own page the page shows its trash banner (patchCard). What the server answers is
  // said in a toast, which outlives them; a refusal puts the card back.
  async function trashNow() {
    setBusy(true);
    setConfirming(null);
    let putBack: (() => void) | undefined;
    if (trashFeedback === 'toast') onLeaving?.(card.id);
    else putBack = patchCard?.({ trashedAt: new Date(), trashedFrom: { visibility: card.visibility, referenceCardId: original ?? null } });
    try {
      await trashActions.trash(ref);
      onTrashed?.(card.id);
      if (trashFeedback === 'toast') {
        toast.show({
          message: t('trashed'),
          announce: title ? t('movedToTrash', { title }) : t('trashed'),
          action: {
            label: t('undo'),
            ariaLabel: title ? t('undoTrashLabel', { title }) : t('undoTrash'),
            icon: 'restore',
            onAction: () => void undo(),
          },
        });
      }
    } catch {
      // Not moved: the card is back in every list and on its page, and the viewer is told.
      putBack?.();
      toast.show({ message: t('trashFailed') });
    } finally {
      setBusy(false);
    }
  }

  // 刪除 on a resonance that reached its original: once the original is
  // known, an anonymous one (whose author it never connected the viewer
  // with) goes at once; a named one, or one that can't be read (a connection
  // can outlive the original going private), asks first.
  const decided =
    deciding && original && lookup?.status === 'ready' && (lookup.asked?.has(original) || lookup.failed?.has(original))
      ? lookup.cards.cards.find((c) => c.id === original)?.anonymous === true
        ? 'at-once'
        : 'ask'
      : null;
  useEffect(() => {
    if (!decided) return;
    setDeciding(false);
    if (decided === 'at-once') void trashNow();
    else setConfirming('trash');
    // trashNow reads only what this render has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided]);

  async function choose(key: ActionKey) {
    if (busy || deciding) return;
    if (key === 'edit') {
      router.push(`/write/${card.id}`);
      return;
    }
    if (key === 'publish') {
      router.push(`/write/${card.id}?step=publish&audience=public`);
      return;
    }
    if (key === 'visibility') {
      // Private at once on its page; a refusal puts it back and says so (round 21).
      setBusy(true);
      const putBack = patchCard?.({ visibility: 'private' });
      try {
        await updateCardSettings(card.id, { visibility: 'private' });
        refreshOwnLists();
        onChanged?.();
      } catch {
        putBack?.();
        toast.show({ message: t('makePrivateFailed') });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (key === 'unresonate') {
      setConfirming('unresonate');
      return;
    }
    // 刪除: to the trash — asking first only for a resonance that reached a named original.
    if (!reachingResonance || referenceAnonymous === true) {
      void trashNow();
    } else if (referenceAnonymous === false) {
      setConfirming('trash');
    } else {
      setDeciding(true);
    }
  }

  // The card stays, answering nothing; the server lets go of its link to the
  // original (DELETE /api/v1/cards/{original}/resonances/{id}). Round 21: the
  // question closes and the link goes from its page at once; a refusal puts it
  // back and says so.
  async function confirmUnresonate() {
    if (busy || !original) return;
    setBusy(true);
    setConfirming(null);
    const putBack = patchCard?.({ referenceCardId: undefined });
    try {
      await unresonate(original, card.id);
      refreshResonance(original, card);
      onChanged?.();
    } catch {
      putBack?.();
      toast.show({ message: t('unresonateFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OrganicMenu
        items={items}
        onChoose={(key) => void choose(key as ActionKey)}
        label={t('menuLabel')}
        seed={seed}
        hue={hue}
        busy={busy || deciding}
        bare={bare}
        className={className}
      />

      {/* To the trash, where it can be restored: the plain solid fill, as 取消共振's — only the connection it
          takes back doesn't come back, which is what the question is for. */}
      <ConfirmModal
        open={confirming === 'trash'}
        title={t('trashResonanceTitle')}
        body={t('trashResonanceBody', { days: TRASH_DAYS })}
        cancelLabel={t('deleteCancel')}
        confirmLabel={t('trashResonanceConfirm')}
        workingLabel={t('delete')}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void trashNow()}
        seed={seed + 5}
      />

      {/* The card stays: nothing here is irreversible, so the verb is the plain solid fill. While the title
          it names is on its way the question waits, rather than changing its words under the reader. */}
      <ConfirmModal
        open={confirming === 'unresonate'}
        title={originalTitle ? t('unresonateConfirmTitle', { title: originalTitle }) : t('unresonate')}
        titlePending={lookup?.status === 'loading'}
        body={t('unresonateConfirmBody')}
        cancelLabel={t('deleteCancel')}
        confirmLabel={t('unresonateConfirm')}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void confirmUnresonate()}
        seed={seed + 9}
      />
    </>
  );
}

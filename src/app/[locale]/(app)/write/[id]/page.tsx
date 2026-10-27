'use client';

import { editTitleKey } from '@/components/molecules/CardEditor/writerTitle';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { LoadError } from '@/components/molecules/LoadError/LoadError';
import { RestoredAloneNotice } from '@/components/molecules/TrashActionsMenu/RestoredAloneNotice';
import { useToast } from '@/components/providers/ToastProvider';
import { trashExpired } from '@/lib/cards/trash';
import { announceRestoredAlone, useTrashActions } from '@/lib/data/trash';
import { HeaderBar } from '@/components/sections/AppHeader/HeaderBar';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { getPendingCardEdit, type PendingCardEdit } from '@/lib/db/firestore/client/cardEdits';
import { Link } from '@/i18n/navigation';
import type { Card, Locale } from '@/lib/db/types';

interface Opened {
  key: string;
  card: Card | null;
  pending: PendingCardEdit | null;
  /** A read failed (offline…): nothing is known, so no editor — it would save over what it couldn't read. */
  failed?: boolean;
}

// The draft loads client-direct from Firestore (rules already scope reads to
// the owner) instead of blocking navigation on a server function — opening a
// card for editing paints immediately with a loader, like the card page.
//
// Read fresh on every open, never from a cache: the editor copies what it is
// given once, and autosaves over the card from there — handed the copy from
// an earlier visit, it would save that older text over what was written
// since.
export default function EditCardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  const tNav = useTranslations('app.nav');
  const leaveWriter = useLeaveWriter('/me');
  const locale = useLocale() as Locale;
  const { user, loading } = useAuth();
  const tActions = useTranslations('me.actions');
  const toast = useToast();
  const trash = useTrashActions();
  const [restoring, setRestoring] = useState(false);

  // Wait for auth to settle: fetching during restoration would read as an
  // anonymous viewer and "not found" the owner's own draft.
  const key = id && user && !loading ? `${id}:${user.id}` : null;
  const [opened, setOpened] = useState<Opened | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async () => {
      try {
        const found = await getCardById(id!);
        const pending = found?.publishedAt ? await getPendingCardEdit(found.id) : null;
        if (live) setOpened({ key, card: found, pending });
      } catch {
        if (live) setOpened({ key, card: null, pending: null, failed: true });
      }
    })();
    return () => {
      live = false;
    };
  }, [key, id, attempt]);
  // Only what was read for this card and this viewer, on this visit.
  const data = opened && opened.key === key ? opened : undefined;
  const card = data?.card;
  const pending = data?.pending ?? null;

  // Until there is a card to write in, the writer's bar stands over the page all the same (the app header
  // steps aside for the writer): the back arrow, and what the page is for — 編輯 alone until the card is read
  // (whether it is a 私人卡 or a shared card isn't known before).
  const bar = (
    <HeaderBar
      title={card && card.authorId === user?.id ? t(editTitleKey(card)) : tActions('edit')}
      backLabel={tNav('back')}
      onBack={leaveWriter}
      heading
    />
  );

  const settled = data !== undefined || (!loading && !user);
  if (!settled) {
    return (
      <>
        {bar}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 'calc(var(--app-header-h) + 120px) 20px 120px',
          }}
          aria-busy="true"
        >
          <SketchLoader />
        </div>
      </>
    );
  }

  if (data?.failed) {
    return (
      <>
        {bar}
        <LoadError
          style={{ padding: 'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)' }}
          onRetry={() => {
            setOpened(null);
            setAttempt((n) => n + 1);
          }}
        />
      </>
    );
  }

  // Missing, deleted, or not the viewer's card (rules deny → null) — or in the trash past its 30 days.
  if (!card || !user || card.authorId !== user.id || (card.trashedAt && trashExpired(card.trashedAt))) {
    return (
      <>
        {bar}
        <div
          style={{
            textAlign: 'center',
            padding: 'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
            {tCard('notFound.title')}
          </p>
          <Link href="/home" style={{ textDecoration: 'none' }}>
            <span style={{ color: 'var(--color-terracotta)' }}>{tCard('notFound.back')}</span>
          </Link>
        </div>
      </>
    );
  }

  // In the trash: nothing is written into it until it is restored (the rules
  // refuse it) — restored, it is read again and opens in the editor.
  if (card.trashedAt) {
    const restore = async () => {
      setRestoring(true);
      try {
        const { droppedResonance } = await trash.restore({ id: card.id, slug: card.slug, referenceCardId: card.trashedFrom?.referenceCardId ?? undefined });
        if (droppedResonance) announceRestoredAlone();
        setOpened(null);
        setAttempt((n) => n + 1);
      } catch {
        toast.show({ message: tActions('undoFailed') });
      } finally {
        setRestoring(false);
      }
    };
    return (
      <>
        {bar}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            minHeight: '100dvh',
            padding: 'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
          }}
        >
          <EmptyState
            fills
            icon="trash"
            seed={61}
            title={tCard('trashed.title')}
            line={t('trashed.line')}
            action={
              <OrganicButton variant="solid" size="sm" loading={restoring} onClick={() => void restore()}>
                {t('trashed.restore')}
              </OrganicButton>
            }
          />
        </div>
        <RestoredAloneNotice />
      </>
    );
  }

  // Buffered edits win over the live fields — that is the copy being worked on.
  const values = pending ?? card;
  return (
    <WriteWorkspace
      title={t(editTitleKey(card))}
      locale={locale}
      referenceCardId={card.referenceCardId}
      initial={{
        id: card.id,
        slug: card.slug,
        publishedAt: card.publishedAt,
        hasPendingEdit: pending != null,
        // How readers have it now (the copy edited may be the pending one's).
        live: { visibility: card.visibility, anonymous: card.anonymous ?? false },
        thoughtCore: values.thoughtCore,
        story: values.story,
        tags: values.tags,
        visibility: values.visibility,
        media: values.media,
        accentHue: values.accentHue ?? undefined,
        anonymous: values.anonymous,
        // The live card's previews of its links (server-made at publish and apply): its link cards' titles.
        linkPreviews: card.linkPreviews,
      }}
    />
  );
}

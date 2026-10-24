'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, type Ref } from 'react';
import useSWR from 'swr';
import {
  CardEditor,
  type CardEditorHandle,
  type CardEditorProps,
  type WriterStep,
} from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { LoadError } from '@/components/molecules/LoadError/LoadError';
import { useAuth } from '@/components/providers/AuthProvider';
import { getPendingCardEdit } from '@/lib/db/firestore/client/cardEdits';
import { OriginalCardPanel } from './LazyOriginalCardPanel';
import type { Card, Locale } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

/**
 * A card opened from the map, rendered in the right pane: the viewer's own
 * cards (draft or published) open straight into their editor — the map already
 * holds the full card, so no loading pass — while resonated cards by another
 * author open as the reading panel (you can't edit someone else's card).
 *
 * A published card still needs one read: its pending-edit buffer. Everything
 * the editor decides about a live card (autosave goes to the buffer, the
 * primary action becomes 儲存修改) hangs off `publishedAt` + that buffer, and
 * the editor reads `initial` exactly once — so the pane waits for it rather
 * than mounting an editor that would write straight through to readers.
 *
 * `titled={false}` leaves the title to the host: the writer's bar, or the
 * thought map pane's own header row. `editorRef` hands the host the editor's
 * handle (folding the pane away saves at once); `editorProps` its two steps
 * (the step, 下一步, the step's name) — the editor keeps the step to itself,
 * with no address of its own. The save line is the pane's, over the writing.
 */
export function OpenedCardPane({
  card,
  titled = true,
  editorRef,
  editorProps,
}: {
  card: Card;
  titled?: boolean;
  editorRef?: Ref<CardEditorHandle>;
  editorProps?: Pick<
    CardEditorProps,
    'onStepChange' | 'onPrimaryActionChange' | 'onPendingChange' | 'onStepTitleChange' | 'inlineStepHeading' | 'focusStepHeading'
  >;
}) {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [step, setStep] = useState<WriterStep>('write');
  const isOwn = user?.id === card.authorId;
  const { data: pending, isLoading, error, mutate } = useSWR(
    isOwn && card.publishedAt ? `pendingEdit:${card.id}` : null,
    () => getPendingCardEdit(card.id)
  );

  if (!isOwn) return <OriginalCardPanel cardId={card.id} />;

  // The buffer couldn't be read: an editor on the live fields would autosave
  // them over it, so none until a read succeeds.
  if (pending === undefined && error) {
    return (
      <div className={styles.editorCol} style={{ display: 'grid', placeItems: 'center' }}>
        <LoadError onRetry={() => void mutate()} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.editorCol} aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <SketchLoader />
      </div>
    );
  }

  // Buffered edits win over the live fields — that is the copy being worked on.
  const values = pending ?? card;
  return (
    <div className={styles.editorCol}>
      {titled && <PageTitle>{card.publishedAt ? t('editPublishedTitle') : t('editTitle')}</PageTitle>}
      {step === 'write' && saveStatus && <p className={styles.saveStatus}>{saveStatus}</p>}
      <CardEditor
        key={card.id}
        ref={editorRef}
        locale={locale}
        referenceCardId={card.referenceCardId}
        onSaveStatusChange={setSaveStatus}
        {...editorProps}
        onStepChange={(next) => {
          setStep(next);
          editorProps?.onStepChange?.(next);
        }}
        initial={{
          id: card.id,
          slug: card.slug,
          publishedAt: card.publishedAt,
          hasPendingEdit: pending != null,
          live: { visibility: card.visibility, anonymous: card.anonymous ?? false },
          thoughtCore: values.thoughtCore,
          story: values.story,
          tags: values.tags,
          visibility: values.visibility,
          media: values.media,
          accentHue: values.accentHue ?? undefined,
          anonymous: values.anonymous,
        }}
      />
    </div>
  );
}

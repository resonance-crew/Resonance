'use client';

import { editTitleKey } from '@/components/molecules/CardEditor/writerTitle';
import { useLocale, useTranslations } from 'next-intl';
import type { Ref } from 'react';
import {
  CardEditor,
  type CardEditorHandle,
  type CardEditorProps,
} from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { LoadError } from '@/components/molecules/LoadError/LoadError';
import { useAuth } from '@/components/providers/AuthProvider';
import { useWriterCard } from '@/lib/data/writerCard';
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
 * (the step, its ✓, the step's name) — the editor keeps the step to itself,
 * with no address of its own. Its save state is the host's to show (`onSaveStatusChange`), in its bar.
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
    | 'onStepChange'
    | 'onPrimaryActionChange'
    | 'onPendingChange'
    | 'onStepTitleChange'
    | 'onSaveStatusChange'
    | 'inlineStepHeading'
    | 'inlineStepBack'
    | 'focusStepHeading'
  >;
}) {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const { user } = useAuth();

  const isOwn = user?.id === card.authorId;
  // The whole card (the map holds list summaries, W11) and a published card's buffer, read side by side on
  // each opening (useWriterCard, as the writer's page reads them) — a draft the map holds whole opens at once.
  const needsRead = isOwn && (!!card.summary || !!card.publishedAt);
  const { data: read, failed, retry } = useWriterCard(needsRead && user ? `${card.id}:${user.id}` : null, card.id, card);

  if (!isOwn) return <OriginalCardPanel cardId={card.id} />;

  // The card or its buffer couldn't be read: an editor on what is here would autosave it over them, so none
  // until a read succeeds.
  if (needsRead && failed) {
    return (
      <div className={styles.editorCol} style={{ display: 'grid', placeItems: 'center' }}>
        <LoadError onRetry={retry} />
      </div>
    );
  }

  if (needsRead && read === undefined) {
    return (
      <div className={styles.editorCol} aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <SketchLoader />
      </div>
    );
  }

  const whole = needsRead ? read?.card : card;
  // Gone since the map read it (deleted, or no longer the viewer's): nothing to write in.
  if (!whole || whole.authorId !== user?.id) return <OriginalCardPanel cardId={card.id} />;
  const pending = needsRead ? (read?.pending ?? null) : null;
  // Buffered edits win over the live fields — that is the copy being worked on.
  const values = pending ?? whole;
  return (
    <div className={styles.editorCol}>
      {titled && <PageTitle>{t(editTitleKey(card))}</PageTitle>}
      <CardEditor
        key={card.id}
        ref={editorRef}
        locale={locale}
        referenceCardId={card.referenceCardId}
        {...editorProps}
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
          // The live card's previews of its links (server-made at publish and apply): its link cards' titles.
          linkPreviews: card.linkPreviews,
        }}
      />
    </div>
  );
}

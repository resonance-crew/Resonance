'use client';

import { SaveState, type SaveStatus } from '@/components/molecules/CardEditor/SaveState';
import { editTitleKey } from '@/components/molecules/CardEditor/writerTitle';
import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import { useAuth } from '@/components/providers/AuthProvider';
import type { CardEditorHandle, PrimaryAction, WriterStep } from '@/components/molecules/CardEditor/CardEditor';
import { PaneActionButton } from '@/components/sections/WriteWorkspace/PaneActionButton';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import styles from '@/components/sections/WriteWorkspace/WriteWorkspace.module.css';

// The pane holds the card editor (Tiptap) — most of this page's weight, and
// needed only once a card is opened. It shows the pane's own loader meanwhile.
const OpenedCardPane = dynamic(
  () => import('@/components/sections/WriteWorkspace/OpenedCardPane').then((m) => m.OpenedCardPane),
  {
    loading: () => (
      <div className={styles.editorCol} aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <SketchLoader />
      </div>
    ),
  },
);

/**
 * The standalone thought-map page, in the unified workspace shell: the map
 * opens full bleed;「開啟卡片」on one of the viewer's cards opens the right pane
 * with the card ready to edit. At the split (≥ 1200px) it is one page with the
 * writer's: the pane beside the map, with no header — another card opens in
 * it in place, someone else's card on its own page, and the divider folds the
 * pane away (saved at once) and docks to show it again. Below the split the
 * pane covers the map: its header row names what it shows, as the writer's
 * bar does, its →| (or Escape) hands the viewport back to the map, and a
 * resonated card by another author opens there as its reading panel.
 */
export function ThoughtMapPage() {
  const t = useTranslations('write');
  const { user } = useAuth();
  const router = useRouter();
  const split = useMediaQuery('(min-width: 1200px)');
  // Back where the map was come from — or, opened in a tab of its own, the viewer's page.
  const leavePage = useLeaveWriter('/me');
  // The Leave saves first: a second tap meanwhile waits for it.
  const leaving = useRef(false);
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  // The pane dragged out to the whole width (at the split): only there is the Leave the pane's back too.
  const [full, setFull] = useState(false);
  const editor = useRef<CardEditorHandle>(null);
  // The opened card's editor: its step (kept to itself — this page's query is its tabs'), its ✓, its business.
  const [step, setStep] = useState<WriterStep>('write');
  const [action, setAction] = useState<PrimaryAction | null>(null);
  const [pending, setPending] = useState(false);
  // The publish step's name as the editor says it (it follows who the card is for).
  const [stepTitle, setStepTitle] = useState<string | null>(null);
  // Its save state, in the pane's header row (or before its ✓ at the split).
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => titleRef.current?.focus({ preventScroll: true }), []);
  const openCard = (card: Card) => {
    if (split === true && card.authorId !== user?.id) router.push(`/card/${card.slug ?? card.id}`);
    // Every card of mine opens in the editor — a 私人卡 as a shared one (round 10 §1). The card shown before it
    // saves as its editor goes.
    else {
      setStep('write');
      setAction(null);
      setOpenedCard(card);
    }
  };
  const paneTitle = !openedCard
    ? null
    : openedCard.authorId !== user?.id
      ? t('referenceCard')
      : step === 'publish'
        ? (stepTitle ?? (openedCard.publishedAt ? t('publishPanel.updateTitle') : t('publishPanel.title')))
        : t(editTitleKey(openedCard));
  // One of the viewer's cards is open to write in: its pane may take the whole width, as the writer's does.
  const writing = openedCard != null && openedCard.authorId === user?.id;
  const fullStep = full && writing && step === 'publish';

  return (
    <WorkspaceShell
      open={openedCard != null}
      // Its back: from the publish step, back to writing; else back to the map.
      onClose={() => {
        if (editor.current?.stepBack()) return;
        setOpenedCard(null);
      }}
      onHide={() => void editor.current?.saveNow().catch((err) => console.error('Save failed:', err))}
      paneTitle={paneTitle}
      paneBack={{ label: step === 'publish' ? t('leaveStay') : undefined, disabled: pending }}
      // The Leave over the map leaves the page (what the pane shows saved first): beside the map the publish step
      // has its own back to writing. At the whole width it is the pane's one back too (round 17 §5.3): from the
      // publish step to writing, else off the page.
      onLeave={() => {
        if (leaving.current) return;
        if (fullStep && editor.current?.stepBack()) return;
        leaving.current = true;
        void (editor.current?.saveNow() ?? Promise.resolve())
          .catch((err) => console.error('Save failed:', err))
          .then(leavePage)
          // Still here a moment later (the way back went nowhere): the Leave answers again.
          .then(() => window.setTimeout(() => (leaving.current = false), 1500));
      }}
      leaveLabel={fullStep ? t('leaveStay') : undefined}
      leaveDisabled={fullStep && pending}
      fillable={writing}
      onFullChange={setFull}
      paneKey={openedCard?.id}
      focusCardId={openedCard?.id}
      onOpenCard={openCard}
      paneStatus={<SaveState status={openedCard ? saveStatus : null} />}
      paneAction={action ? <PaneActionButton action={action} /> : undefined}
      titleRef={titleRef}
    >
      {openedCard && (
        <OpenedCardPane
          key={openedCard.id}
          card={openedCard}
          titled={false}
          editorRef={editor}
          editorProps={{
            onStepChange: setStep,
            onPrimaryActionChange: setAction,
            onPendingChange: setPending,
            onStepTitleChange: setStepTitle,
            onSaveStatusChange: setSaveStatus,
            inlineStepHeading: split === true,
            inlineStepBack: split === true && !full,
            focusStepHeading: focusTitle,
          }}
        />
      )}
    </WorkspaceShell>
  );
}

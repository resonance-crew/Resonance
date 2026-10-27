'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  CardEditor,
  type CardEditorHandle,
  type CardEditorProps,
  type PrimaryAction,
  type WriterStep,
} from '@/components/molecules/CardEditor/CardEditor';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { SaveState, type SaveStatus } from '@/components/molecules/CardEditor/SaveState';
import { editTitleKey } from '@/components/molecules/CardEditor/writerTitle';
import { OpenedCardPane } from './OpenedCardPane';
import { PaneActionButton } from './PaneActionButton';
import { OriginalCardPanel } from './LazyOriginalCardPanel';
import { WorkspaceShell, type WorkspaceShellHandle } from './WorkspaceShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

export interface WriteWorkspaceProps {
  title: ReactNode;
  locale: CardEditorProps['locale'];
  initial?: CardEditorProps['initial'];
  referenceCardId?: string;
  /** Words to start the story with (a note grown into a resonance carries its own along). */
  seedStory?: string;
}

/** The publish step's place in the address: the writer's own page's `?step=publish`. */
const STEP_PARAM = 'step';
/**
 * A 私人卡's 公開發表 (round 12 §3) opens the step with `&audience=public`: the choice starts at 公開. Read once
 * and dropped from the address, so going back to writing (or a reload) doesn't carry it.
 */
const AUDIENCE_PARAM = 'audience';
function stepIn(search: string): WriterStep {
  return new URLSearchParams(search).get(STEP_PARAM) === 'publish' ? 'publish' : 'write';
}

/**
 * Write mode inside the unified workspace. At the split (≥ 1200px) it is one
 * page with the thought map's: the map on the left, this draft's editor in
 * the right pane, the Leave floating over the map its way back — no bar, the
 * editor's 下一步 floating at the pane's top-right. Writing a resonance swaps
 * the map for the original card.「開啟卡片」on one of the viewer's own cards
 * opens it in the pane, in place (the draft is saved first and waits under it
 * as it was: its own card on the map brings it back); someone else's card
 * opens its card page. Below the split the pane covers the map under the
 * writer's bar — the back arrow, the title and 下一步, as on the apps' writer
 * page.
 *
 * 下一步 opens the publish step in the same place, and the address says so
 * (`?step=publish`, pushed): the bar's back, the browser's back and the
 * step's own 繼續寫 return to writing; the bar names the step. A card opened
 * from the map keeps its step to itself (no address of its own).
 *
 * The way out leaves the page, asking first when that leaves written work
 * behind (the apps' rule and words: it is kept either way). 私人卡 + 儲存 in
 * the publish step is already that choice, so it doesn't ask: it opens the
 * card's page in the writer's place (round 9 §1).
 */
export function WriteWorkspace({
  title,
  locale,
  initial,
  referenceCardId,
  seedStory,
}: WriteWorkspaceProps) {
  const t = useTranslations('write');
  const { user } = useAuth();
  const router = useRouter();
  const split = useMediaQuery('(min-width: 1200px)');
  // A card opened from the map takes over the pane (in-memory Card → no
  // loading); never the draft's own card, which keeps the live editor.
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  // The editor's own save state, lifted into the bar beside the title (or before the ✓ at the split): it
  // has to be in view wherever the story is scrolled — the people who need it are the ones wondering
  // whether it is safe to walk away. A card opened over the draft says its own.
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [openedStatus, setOpenedStatus] = useState<SaveStatus | null>(null);
  const editor = useRef<CardEditorHandle>(null);
  // The editor of a card opened from the map (the viewer's own).
  const opened = useRef<CardEditorHandle>(null);
  const shell = useRef<WorkspaceShellHandle>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // The arrow and the dialog can both land before the page has gone: it leaves once.
  const leaving = useRef(false);
  const showOpened = openedCard != null;
  const isPublished = initial?.publishedAt != null;

  // ---- The draft's step, in the address ------------------------------------
  const [step, setStep] = useState<WriterStep>('write');
  // Whether this page put the step's entry in the tab's history (so going back pops it).
  const pushedStep = useRef(false);
  // What waits for the step's entry to be popped (leaving from the step).
  const afterPop = useRef<(() => void) | null>(null);
  const [startPublic, setStartPublic] = useState(false);
  useEffect(() => {
    // Opened at the step (a reload, or a 私人卡's 公開發表): the draft's step, whose entry is this one.
    if (initial?.id && stepIn(window.location.search) === 'publish') setStep('publish');
    const params = new URLSearchParams(window.location.search);
    if (params.get(AUDIENCE_PARAM) != null) {
      if (initial?.id && params.get(AUDIENCE_PARAM) === 'public') setStartPublic(true);
      params.delete(AUDIENCE_PARAM);
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
    const onPop = () => {
      const now = stepIn(window.location.search);
      if (now === 'write') pushedStep.current = false;
      setStep(now);
      const go = afterPop.current;
      afterPop.current = null;
      go?.();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeStep = useCallback((next: WriterStep) => {
    if (next === 'publish') {
      // The draft's first save gave the page its own address (/write/{id}) before this.
      const { pathname, search } = window.location;
      if (stepIn(search) !== 'publish') {
        const params = new URLSearchParams(search);
        params.set(STEP_PARAM, 'publish');
        window.history.pushState(window.history.state, '', `${pathname}?${params}`);
        pushedStep.current = true;
      }
      setStep('publish');
    } else if (pushedStep.current) {
      // The browser's back, in effect: popstate brings the writing step back.
      window.history.back();
    } else {
      // Opened at the step: its address loses the step in place.
      const params = new URLSearchParams(window.location.search);
      params.delete(STEP_PARAM);
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
      setStep('write');
    }
  }, []);
  /** Leaves from wherever the draft is: from the step, its entry is popped first, so the way out isn't to it. */
  const outOfStep = (go: () => void) => {
    if (pushedStep.current) {
      afterPop.current = go;
      window.history.back();
    } else go();
  };

  // What the pane's editor does next (下一步), and what it is busy with: the draft's, or a card opened over it.
  const [draftAction, setDraftAction] = useState<PrimaryAction | null>(null);
  const [openedAction, setOpenedAction] = useState<PrimaryAction | null>(null);
  const [openedStep, setOpenedStep] = useState<WriterStep>('write');
  const [draftPending, setDraftPending] = useState(false);
  const [openedPending, setOpenedPending] = useState(false);
  // The publish step's name as each editor says it (it follows who the card is for).
  const [draftStepTitle, setDraftStepTitle] = useState<string | null>(null);
  const [openedStepTitle, setOpenedStepTitle] = useState<string | null>(null);
  const shownAction = showOpened ? openedAction : draftAction;
  const shownStep = showOpened ? openedStep : step;
  const shownPending = showOpened ? openedPending : draftPending;
  // The bar's title, which the publish step's name moves the focus to below the split.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusBarTitle = useCallback(() => titleRef.current?.focus({ preventScroll: true }), []);

  // What the pane shows names the bar: the draft, or a card opened from the
  // map — the viewer's own to edit, or the original of one they resonated with.
  // In the publish step, the step.
  const shownPublished = showOpened ? openedCard.publishedAt != null : isPublished;
  const barTitle =
    shownStep === 'publish'
      ? ((showOpened ? openedStepTitle : draftStepTitle) ??
        (shownPublished ? t('publishPanel.updateTitle') : t('publishPanel.title')))
      : !showOpened
        ? title
        : openedCard.authorId !== user?.id
          ? t('referenceCard')
          : t(editTitleKey(openedCard));

  /** Saves what is written in the pane now — the draft, and a card opened over it — not left to the debounce. */
  const saveAll = async () => {
    const results = await Promise.allSettled([editor.current?.saveNow(), opened.current?.saveNow()]);
    for (const r of results) if (r.status === 'rejected') console.error('Save failed:', r.reason);
  };

  // What is written is saved first (not left to the debounce or the unmount),
  // then the page goes back to wherever the writer came from (or, with
  // nowhere to go back to in this tab, to the card box or the feed). A save
  // that fails doesn't keep it: the unmount's flush tries once more, and
  // staying would only ask again.
  const leaveWriter = useLeaveWriter(initial?.id ? '/me' : '/home');
  const leave = async () => {
    setConfirmingLeave(false);
    if (leaving.current) return;
    leaving.current = true;
    await saveAll();
    outOfStep(leaveWriter);
    // Still here a moment later (the way back went nowhere): the way out answers again.
    window.setTimeout(() => (leaving.current = false), 1500);
  };

  // 開啟卡片 on the map (at the split, where the map stands beside the pane).
  const openCard = (card: Card) => {
    // Someone else's card is read on its own page (the draft saved first: a fresh /write takes its card's
    // address at its first save, so the way back finds this draft, not a blank one).
    if (card.authorId !== user?.id) {
      void saveAll().then(() => router.push(`/card/${card.slug ?? card.id}`));
      return;
    }
    // The draft's own card is the draft: it folds a card opened over it back to it. Its own card is the
    // editor's: a fresh /write's draft has its id from its first save on, which the route's `initial` never
    // learns.
    if (card.id === (editor.current?.cardId() ?? initial?.id)) {
      setOpenedCard(null);
      return;
    }
    // Another of the viewer's cards opens in place. The draft, which stays mounted under it, is saved first;
    // a card opened before it saves as its editor goes.
    if (!showOpened) void editor.current?.saveNow().catch((err) => console.error('Save failed:', err));
    setOpenedAction(null);
    setOpenedStep('write');
    setOpenedCard(card);
  };

  // The way out — the bar's back below the split, the Leave over the map at it: asks first when it would
  // leave written work behind. Below the split a card opened over the draft (at the split, before the window
  // narrowed) steps back to the draft first.
  const leaveAsking = () => {
    // On its way out already: a second tap waits for it.
    if (leaving.current) return;
    if (editor.current?.hasWork() || opened.current?.hasWork()) setConfirmingLeave(true);
    else void leave();
  };
  const goBack = () => {
    if (leaving.current) return;
    // From the publish step, back to writing — never a question.
    if (showOpened) {
      if (opened.current?.stepBack()) return;
      // Written full width, a card opened from the map goes back to the map (the pane folds away, to come back
      // at 1:1 with it), as the apps' writer does; beside the map, back to the draft under it.
      if (shell.current?.isFull()) {
        shell.current.foldToMap();
        return;
      }
      setOpenedCard(null);
      return;
    }
    if (editor.current?.stepBack()) return;
    leaveAsking();
  };
  // A live card's revision is kept but not applied: said of the card the pane shows.
  const leavingPublished = showOpened ? openedCard.publishedAt != null : isPublished;

  return (
    <>
      <WorkspaceShell
        ref={shell}
        open
        bar={{
          title: barTitle,
          onBack: goBack,
          backDisabled: shownPending,
          backLabel: shownStep === 'publish' ? t('leaveStay') : undefined,
        }}
        onLeave={leaveAsking}
        onHide={() => void saveAll()}
        leftOverride={referenceCardId ? <OriginalCardPanel cardId={referenceCardId} /> : undefined}
        onOpenCard={openCard}
        // The card opened over the draft, else the draft's own (a fresh one is on no map yet).
        focusCardId={openedCard?.id ?? initial?.id}
        paneStatus={<SaveState status={showOpened ? openedStatus : saveStatus} />}
        paneAction={shownAction ? <PaneActionButton action={shownAction} /> : undefined}
        titleRef={titleRef}
      >
        {/* The draft stays mounted under a card opened from the map, so its
            own card brings it back as it was — remounted from `initial`, a new
            card would start over without its draft and write a second one. */}
        <div className={styles.paneLayer} hidden={showOpened}>
          <div className={styles.editorCol}>
            <CardEditor
              ref={editor}
              initial={initial}
              seedStory={seedStory}
              locale={locale}
              referenceCardId={referenceCardId}
              onSaveStatusChange={setSaveStatus}
              step={step}
              onStepChange={changeStep}
              onPrimaryActionChange={setDraftAction}
              onPendingChange={setDraftPending}
              onStepTitleChange={setDraftStepTitle}
              startPublic={startPublic}
              inlineStepHeading={split === true}
              focusStepHeading={focusBarTitle}
              // A 私人卡 kept opens its page in the writer's own entry: from the step, its entry is popped first.
              onShowCard={(href) => outOfStep(() => router.replace(href))}
            />
          </div>
        </div>
        {showOpened && (
          <div key={openedCard.id} className={styles.paneLayer}>
            <OpenedCardPane
              card={openedCard}
              titled={false}
              editorRef={opened}
              editorProps={{
                onStepChange: setOpenedStep,
                onPrimaryActionChange: setOpenedAction,
                onPendingChange: setOpenedPending,
                onStepTitleChange: setOpenedStepTitle,
                onSaveStatusChange: setOpenedStatus,
                inlineStepHeading: split === true,
                focusStepHeading: focusBarTitle,
              }}
            />
          </div>
        )}
      </WorkspaceShell>
      <ConfirmModal
        open={confirmingLeave}
        title={t('leaveTitle')}
        body={leavingPublished ? t('leaveBodyRevision') : t('leaveBody')}
        cancelLabel={t('leaveStay')}
        confirmLabel={t('leaveConfirm')}
        onCancel={() => setConfirmingLeave(false)}
        onConfirm={() => void leave()}
      />
    </>
  );
}

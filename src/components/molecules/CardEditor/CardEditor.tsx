'use client';

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useTranslations } from 'next-intl';
import { CharCount, FieldHint, Textarea } from '@/components/atoms/Field/Field';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/molecules/MarkdownEditor/MarkdownEditor';
import { PublishStep, reachesOriginal } from '@/components/molecules/PublishStep/PublishStep';
import { createCardDraft, publishCard, updateCardDraft } from '@/lib/db/firestore/client/cards';
import {
  applyPendingCardEdit,
  discardPendingCardEdit,
  savePendingCardEdit,
} from '@/lib/db/firestore/client/cardEdits';
import { getCardById } from '@/lib/db/firestore/client/reads';
import type { Card, CardMedia, Visibility, Locale } from '@/lib/db/types';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/db/firestore/client/api';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import { useConnectionRefresh } from '@/lib/data/resonate';
import { localeScript, storyLang, writerScript, type StoryScript } from '@/lib/text/script';
import { isTrashed, isTrashRefusal, mayBeTrashed, restoreTrashedCard } from './trashedCard';
import '@/styles/story.css';
import styles from './CardEditor.module.css';

/** The longest title a card takes (the server's too). */
export const TITLE_MAX = 60;
/** From this many characters on, the title says how many are left. */
const TITLE_COUNT_FROM = 50;
/** How long 下一步 waits on the first save before it shows its loader. */
const NEXT_LOADER_MS = 300;

/** The writer's two steps: writing (the title and the story), then publishing (發布這張卡片 / 更新這張卡片). */
export type WriterStep = 'write' | 'publish';

/** What the page around the editor draws as its one forward action (下一步): in its bar, or floating at the split. */
export interface PrimaryAction {
  label: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}

export interface CardEditorProps {
  initial?: {
    id?: string;
    /** URL slug of a published card — where saving an edit returns to. */
    slug?: string;
    /**
     * Set when this card is already live. Flips the editor from "writing a
     * draft" to "revising something people can read": autosave goes to the
     * private pending-edit buffer instead of the card, and the publish step
     * becomes 更新這張卡片 → 儲存修改.
     */
    publishedAt?: Date | null;
    /** A working copy was already buffered for this published card. */
    hasPendingEdit?: boolean;
    /**
     * A live card's audience as readers have it now (the copy being edited may
     * be a pending edit's): whether saving makes a resonance reach its original.
     */
    live?: { visibility: Visibility; anonymous: boolean };
    thoughtCore?: string;
    story?: string;
    tags?: string[];
    visibility?: Visibility;
    media?: CardMedia;
    accentHue?: number;
    anonymous?: boolean;
  };
  /**
   * Words the writer brings along to start the story with (a note grown into
   * a resonance carries its own): written by the writer, so unlike `initial`
   * they are work to keep — the draft is saved with them.
   */
  seedStory?: string;
  /** The UI's locale: a new card's language, and the type an empty draft starts in. */
  locale: Locale;
  /**
   * When set, the created/updated card references this card (a "resonance"
   * response card). Forwarded to {@link createCardDraft}.
   */
  referenceCardId?: string;
  /**
   * Reports the story text as it is typed. Lets a wrapper offer exits that
   * carry the draft along.
   */
  onStoryChange?: (story: string) => void;
  /**
   * Reports the save state as ready-to-render copy ("草稿已自動儲存 · 14:32").
   * The host shows it at the top of the column — the reassurance has to be
   * visible without scrolling to the bottom of the form.
   */
  onSaveStatusChange?: (label: string | null) => void;
  /**
   * The step shown, when the host keeps it (the writer's page puts it in the
   * address, so the browser's back returns to writing); the editor keeps its
   * own otherwise (the thought map's pane).
   */
  step?: WriterStep;
  /** The editor asks to change step (下一步, 繼續寫, or back to writing to show why it can't go on). */
  onStepChange?: (step: WriterStep) => void;
  /** What the host draws as the one way forward while writing (null in the publish step, or for a trashed card). */
  onPrimaryActionChange?: (action: PrimaryAction | null) => void;
  /**
   * The pane has no bar (at the split): the publish step names itself in its
   * own first row. Otherwise the host's bar does, and `focusStepHeading`
   * moves the focus there as the step opens.
   */
  inlineStepHeading?: boolean;
  focusStepHeading?: () => void;
  /** The way out once the draft is saved for later (the host's; by default back where the writer came from). */
  onLeave?: () => void;
  /** Publishing, saving or leaving is on its way: the host's back waits with the step's buttons. */
  onPendingChange?: (pending: boolean) => void;
  /** What the page around it asks as it goes (the writer's back arrow). */
  ref?: Ref<CardEditorHandle>;
}

/** What the writer's page asks of its editor before it leaves — the apps' WriteModel `hasWork` / `saveNow`. */
export interface CardEditorHandle {
  /**
   * Whether going back leaves something written behind (it is kept; the
   * writer is asked first): a new card or draft with words, a title, tags or
   * a cover in it that is kept (it has a draft) or is about to be; a live
   * card's revision, waiting in its buffer or typed and not saved yet. Words
   * the first-card guide seeded are the starting point, not writing: nothing
   * keeps them, so they count only once there is a draft. The apps'
   * `holdsWork`, rule for rule.
   */
  hasWork(): boolean;
  /** Writes what is on screen now, if it isn't yet — leaving doesn't wait out the debounce. */
  saveNow(): Promise<void>;
  /**
   * The card this editor writes: the one it was opened on, or — a fresh
   * /write — the draft its first save made; undefined before that.
   */
  cardId(): string | undefined;
  /**
   * The back arrow from the publish step: back to writing (true), or — while
   * writing, nothing to step back to — false, and the page's way out answers.
   * A publish on its way holds it (true: nothing else happens).
   */
  stepBack(): boolean;
}

/** Everything a draft save writes, in one comparable shape. */
interface DraftValues {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  anonymous: boolean;
  media?: CardMedia;
  accentHue: number | null;
}

/** Canonical serialization — key order is fixed so equality is comparable. */
function draftSnapshot(v: DraftValues): string {
  return JSON.stringify({
    thoughtCore: v.thoughtCore,
    story: v.story,
    tags: v.tags,
    visibility: v.visibility,
    anonymous: v.anonymous,
    media: v.media,
    accentHue: v.accentHue,
  });
}

/** A draft with no content yet — autosave won't create a document for it, and 下一步 has nothing to take on. */
function isEmptyDraft(v: DraftValues): boolean {
  return !v.thoughtCore.trim() && !v.story.trim() && v.tags.length === 0 && !v.media;
}

/** The title is one line: a line break typed or pasted into it is a space. */
function oneLine(text: string): string {
  return text.replace(/\r\n?|\n/g, ' ').slice(0, TITLE_MAX);
}

/** The nearest box that scrolls (the writer's pane): each step keeps its own place in it. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/** How long editing must pause before the draft autosaves (and its type is read again). */
const AUTOSAVE_DELAY_MS = 1500;

/**
 * The writer, in two steps (writer.spec). Writing: a bare page — the title
 * and the story, set as the card page will set them (src/styles/story.css),
 * nothing else on it but the save line (the host's) and one 下一步 (the
 * host's bar, or floating at the split: `onPrimaryActionChange`). 下一步 asks
 * for a title, makes sure a new draft exists, and opens the publish step in
 * the same place (PublishStep): the mirror, the card as a list will show it
 * with its cover, tags, audience and anonymity, then 發布 (or, for a live
 * card, 儲存修改). The story stays mounted under the step, so its undo
 * history and selection survive the round trip; everything chosen in the
 * step is the editor's own value and autosaves like the words.
 */
export function CardEditor({
  initial,
  seedStory,
  locale,
  referenceCardId,
  onStoryChange,
  onSaveStatusChange,
  step: stepProp,
  onStepChange,
  onPrimaryActionChange,
  inlineStepHeading = false,
  focusStepHeading,
  onLeave,
  onPendingChange,
  ref,
}: CardEditorProps) {
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  const tNative = useTranslations('native');
  const tSafety = useTranslations('safety');
  const tMe = useTranslations('me.actions');
  const router = useRouter();
  const refreshConnections = useConnectionRefresh();
  // Back where the writer came from — or, in a tab of its own, to the card box, where the draft now is.
  const leaveWriter = useLeaveWriter('/me');

  const [thoughtCore, setThoughtCore] = useState(initial?.thoughtCore ?? '');
  const [story, setStory] = useState(initial?.story ?? seedStory ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [media, setMedia] = useState<CardMedia | undefined>(initial?.media);
  // Cover-image dominant hue (snapped to the card palette). Recomputed when a
  // cover is uploaded/generated, cleared when removed.
  const [accentHue, setAccentHue] = useState<number | null>(initial?.accentHue ?? null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  // Which action `pending` is for: its button shows the loader (B6), the other rests.
  const [busyVerb, setBusyVerb] = useState<'publish' | 'leave'>('publish');
  const [publishError, setPublishError] = useState<string | null>(null);
  // 下一步 found no title.
  const [titleError, setTitleError] = useState(false);
  // 下一步's save didn't go through.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const nextBusy = useRef(false);
  // Pictures still on their way into the story.
  const [storyBusy, setStoryBusy] = useState(false);
  // Moved to the trash elsewhere while open here (trash.spec §5.5).
  const [trashed, setTrashed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Revising a live card: the step's verb saves changes rather than
  // publishing, and autosave buffers instead of writing through. Fixed for the
  // editor's lifetime — the host remounts it when the route's card changes.
  const isPublished = initial?.publishedAt != null;
  const [hasPendingEdit, setHasPendingEdit] = useState(initial?.hasPendingEdit ?? false);

  // ---- The step ---------------------------------------------------------
  const [ownStep, setOwnStep] = useState<WriterStep>('write');
  const step = stepProp ?? ownStep;
  const changeStep = useCallback(
    (next: WriterStep) => {
      if (stepProp === undefined) setOwnStep(next);
      onStepChange?.(next);
    },
    [stepProp, onStepChange],
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  // The publish step mounts the first time it is shown, and stays (a cover on its way, the mirror's answer).
  const publishLoaded = useOpenedOnce(step === 'publish');

  // ---- The story's type ----------------------------------------------------
  // Read again on the autosave tick, never per keystroke: a new card starts in
  // its UI locale's type, and changes only once there is enough of it and it
  // leans clearly the other way (writerScript).
  const [type, setType] = useState<{ script: StoryScript; lang: string | undefined }>(() => {
    const title = initial?.thoughtCore ?? '';
    const text = initial?.story ?? seedStory ?? '';
    return { script: writerScript(localeScript(locale), title, text), lang: storyLang(title, text) };
  });
  useEffect(() => {
    const h = setTimeout(() => {
      setType((now) => {
        const script = writerScript(now.script, thoughtCore, story);
        const lang = storyLang(thoughtCore, story);
        return script === now.script && lang === now.lang ? now : { script, lang };
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(h);
  }, [thoughtCore, story]);

  const reportPending = useRef(onPendingChange);
  reportPending.current = onPendingChange;
  useEffect(() => {
    reportPending.current?.(pending);
  }, [pending]);

  useEffect(() => {
    onStoryChange?.(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

  // ---- Autosave ---------------------------------------------------------
  // Work persists on its own shortly after editing pauses, so backing out of
  // the editor is always safe. *Where* it persists depends on the card:
  //   • a draft writes straight to its own document — nobody can read it yet;
  //   • a published card writes to its private pending-edit buffer, so a
  //     half-finished revision never reaches the people already reading it.
  // Everything the save needs travels through refs so the debounce timer, the
  // unmount flush, and the publish path all write the same latest values.
  const draftIdRef = useRef(initial?.id);
  const values: DraftValues = { thoughtCore, story, tags, visibility, anonymous, media, accentHue };
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const lastSavedRef = useRef(
    draftSnapshot({
      thoughtCore: initial?.thoughtCore ?? '',
      story: initial?.story ?? '',
      tags: initial?.tags ?? [],
      visibility: initial?.visibility ?? 'public',
      anonymous: initial?.anonymous ?? false,
      media: initial?.media,
      accentHue: initial?.accentHue ?? null,
    }),
  );
  // All draft writes queue on one chain so an in-flight autosave can never
  // race the publish path into creating a second document.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  // Set once the editor is done with this card (saved or discarded): the
  // unmount flush must not resurrect a buffer we just cleared.
  const closedRef = useRef(false);
  const trashedRef = useRef(false);
  trashedRef.current = trashed;

  /**
   * One line of plain reassurance at the top of the column. It says both what
   * has happened and, for a live card, what has *not* happened yet. A draft
   * says nothing until its first save; a card in the trash has its own line
   * (with 還原), drawn by the editor.
   */
  const saveStatusLabel = useMemo(() => {
    if (trashed) return null;
    const time = savedAt?.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (isPublished) {
      if (savedAt) return t('editBuffered', { time: time! });
      return hasPendingEdit ? t('editBufferedIdle') : t('editLiveHint');
    }
    return savedAt ? t('autosaved', { time: time! }) : null;
  }, [savedAt, hasPendingEdit, isPublished, trashed, locale, t]);

  useEffect(() => {
    onSaveStatusChange?.(saveStatusLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatusLabel]);

  /** The editable body, in the shape both the card doc and the buffer take. */
  function payloadFrom(v: DraftValues) {
    return {
      thoughtCore: v.thoughtCore,
      story: v.story,
      tags: v.tags,
      visibility: v.visibility,
      media: v.media,
      accentHue: v.accentHue,
      anonymous: v.anonymous,
    };
  }

  /**
   * Persist the working copy. Returns the card for a draft (the caller may
   * need its freshly minted id); a published card's edits land in the buffer,
   * which has no card to hand back — hence `null`.
   */
  function saveDraft(): Promise<Card | null> {
    const run = writeChainRef.current.then(async () => {
      const v = valuesRef.current;
      const payload = payloadFrom(v);
      if (isPublished && draftIdRef.current) {
        await savePendingCardEdit(draftIdRef.current, payload);
        setHasPendingEdit(true);
        lastSavedRef.current = draftSnapshot(v);
        setSavedAt(new Date());
        return null;
      }
      const card = draftIdRef.current
        ? await updateCardDraft(draftIdRef.current, payload)
        : await createCardDraft({ ...payload, originalLocale: locale, referenceCardId });
      if (!draftIdRef.current) {
        // First save of a fresh draft: swap /write for /write/{id} in place
        // (Next integrates native replaceState) so a reload or a later
        // traversal reopens this draft instead of a blank editor — before the
        // publish step's entry is pushed over it.
        const path = window.location.pathname;
        const next = path.replace(/\/write(\/[^/]+)?$/, `/write/${card.id}`);
        if (next !== path) {
          const base = (window.history.state ?? {}) as Record<string, unknown>;
          window.history.replaceState(base, '', next);
        }
      }
      draftIdRef.current = card.id;
      lastSavedRef.current = draftSnapshot(v);
      setSavedAt(new Date());
      return card;
    });
    writeChainRef.current = run.catch(() => undefined);
    return run;
  }

  /** What is on screen differs from what was last written, and is worth writing (a blank new card isn't). */
  function needsSave(): boolean {
    const v = valuesRef.current;
    return draftSnapshot(v) !== lastSavedRef.current && !(!draftIdRef.current && isEmptyDraft(v));
  }

  /**
   * A write or a publish was refused in a way the card being in the trash
   * would explain: the card is read again, and if it is there the writer says
   * so (with 還原), back on the writing step, keeping everything typed.
   */
  async function confirmTrashed(err: unknown): Promise<boolean> {
    const id = draftIdRef.current;
    if (!id || !mayBeTrashed(err)) return false;
    try {
      const card = await getCardById(id);
      if (!isTrashed(card)) return false;
    } catch {
      // Not read: a 409 from the server is answer enough.
      if (!isTrashRefusal(err)) return false;
    }
    setTrashed(true);
    setRestoreError(null);
    if (stepRef.current !== 'write') changeStep('write');
    return true;
  }

  // Kick a save if the current values differ from what was last written.
  // Failures stay silent (logged) — the state remains dirty, so the next
  // pause or the publish path retries — unless the card turns out to be in
  // the trash, which the writer is then told.
  function autosaveNow() {
    if (closedRef.current || trashedRef.current || !needsSave()) return;
    void saveDraft().catch(async (err) => {
      if (await confirmTrashed(err)) return;
      console.error('Autosave failed:', err);
    });
  }
  const autosaveNowRef = useRef(autosaveNow);
  autosaveNowRef.current = autosaveNow;

  // Debounce: save AUTOSAVE_DELAY_MS after the last edit.
  useEffect(() => {
    const h = setTimeout(() => autosaveNowRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(h);
  }, [thoughtCore, story, tags, visibility, anonymous, media, accentHue]);

  // Edits younger than the debounce flush when the editor unmounts (in-app
  // back/navigation keeps the JS context alive, so the async write completes)
  // and when the tab is backgrounded — the closest signal mobile gives before
  // being killed.
  useEffect(() => {
    const flush = () => autosaveNowRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  /**
   * Why publishing, saving or discarding didn't go through, in the writer's
   * language — never the server's or Firestore's English: the day's
   * publishing used up says so (trying again today won't help), a card gone
   * can't be found, anything else is `fallback` (didn't publish, didn't
   * save… — try again).
   */
  const failure = (err: unknown, fallback: string) =>
    err instanceof ApiError && (err.status === 429 || err.code === 'rate_limited')
      ? t('publishPanel.rateLimited')
      : err instanceof ApiError && err.status === 404
        ? tCard('notFound.title')
        : fallback;

  // ---- Step 1: the title, the story, 下一步 --------------------------------
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const storyRef = useRef<MarkdownEditorHandle>(null);
  // Which field the writer was in: going back to writing puts them there again.
  const lastField = useRef<'title' | 'story' | null>(null);
  const titleErrorId = useId();

  /** No title: the writing step, its title asking for one. */
  function askForTitle() {
    setTitleError(true);
    if (stepRef.current !== 'write') changeStep('write');
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  async function goNext() {
    if (nextBusy.current || pending || trashedRef.current) return;
    if (!valuesRef.current.thoughtCore.trim()) {
      askForTitle();
      return;
    }
    setSaveError(null);
    if (!draftIdRef.current) {
      // A new draft is written before the step opens: the step is an address of the draft's own
      // (/write/{id}?step=publish), which a reload or the browser's back must find.
      nextBusy.current = true;
      const loader = window.setTimeout(() => setNextLoading(true), NEXT_LOADER_MS);
      try {
        await saveDraft();
      } catch (err) {
        console.error('Save before publishing failed:', err);
        setSaveError(tNative('saveError'));
        return;
      } finally {
        window.clearTimeout(loader);
        setNextLoading(false);
        nextBusy.current = false;
      }
    } else if (needsSave()) {
      // A draft that is kept already saves on its way: the step opens at once.
      void saveDraft().catch(async (err) => {
        if (await confirmTrashed(err)) return;
        console.error('Autosave failed:', err);
      });
    }
    changeStep('publish');
  }
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // The one way forward, drawn by the host: 下一步 while writing; nothing in the publish step (its foot has
  // the verb) or for a card in the trash.
  const actionHidden = step !== 'write' || trashed;
  const actionDisabled = !isPublished && isEmptyDraft(values);
  const reportAction = useRef(onPrimaryActionChange);
  reportAction.current = onPrimaryActionChange;
  const nextLabel = t('next');
  useEffect(() => {
    reportAction.current?.(
      actionHidden
        ? null
        : { label: nextLabel, disabled: actionDisabled, loading: nextLoading, onPress: () => void goNextRef.current() },
    );
  }, [actionHidden, actionDisabled, nextLoading, nextLabel]);
  useEffect(() => () => reportAction.current?.(null), []);

  // ---- Moving between the steps: focus and each step's place in the scroll ----
  const rootRef = useRef<HTMLDivElement>(null);
  const writeScroll = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const headingFocusPending = useRef(false);
  const prevStep = useRef(step);
  useLayoutEffect(() => {
    if (prevStep.current === step) return;
    const from = prevStep.current;
    prevStep.current = step;
    const scroller = scrollParent(rootRef.current);
    if (step === 'publish') {
      if (from === 'write' && scroller) writeScroll.current = scroller.scrollTop;
      if (scroller) scroller.scrollTop = 0;
      // The step names itself where the focus goes: its own heading at the split, the host's bar otherwise.
      if (inlineStepHeading) {
        if (headingRef.current) headingRef.current.focus({ preventScroll: true });
        else headingFocusPending.current = true;
      } else focusStepHeading?.();
    } else {
      if (scroller) scroller.scrollTop = writeScroll.current;
      // Back where the writer was: the title, or the story with its selection.
      if (lastField.current === 'story') storyRef.current?.focus('keep');
      else titleRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const setHeading = useCallback((el: HTMLHeadingElement | null) => {
    headingRef.current = el;
    if (el && headingFocusPending.current) {
      headingFocusPending.current = false;
      el.focus({ preventScroll: true });
    }
  }, []);

  // ---- Step 2: publish, save changes, leave ---------------------------------
  async function submit() {
    if (pending) return;
    // The server refuses a card without a title; say so in the writer's words, where the title is.
    if (!valuesRef.current.thoughtCore.trim()) {
      askForTitle();
      return;
    }
    setBusyVerb('publish');
    setPending(true);
    setPublishError(null);
    try {
      const card = await saveDraft();
      if (!card) throw new Error('Draft was not saved');
      // One server call publishes it (POST /api/v1/cards/{id}/publish, as the
      // apps do): it stamps the card once, gives it its English URL slug (the
      // id stands in if that AI step fails — publishing never fails for it),
      // and for a resonance's first publish connects the two authors and
      // rings the original author's bell — never for an anonymous one, whose
      // connection would name its author. The recommendation index and the
      // card page's cache are refreshed after the response.
      const published = await publishCard(card.id);
      closedRef.current = true;
      // In place of the step's own address: back from the card is the writing step, never a step of a card
      // that is live now.
      router.replace(`/card/${published.slug ?? published.id}`);
    } catch (err) {
      if (await confirmTrashed(err)) return;
      console.error('Publish failed:', err);
      setPublishError(failure(err, t('publishPanel.failed')));
    } finally {
      setPending(false);
    }
  }

  /** Where a published card's editor returns to. */
  const cardHref = `/card/${initial?.slug ?? draftIdRef.current ?? initial?.id ?? ''}`;

  /**
   * Merge the buffered revision into the live card. This — not autosave — is
   * the moment an edit becomes visible to readers. One server call does it
   * (POST /api/v1/cards/{id}/edits/apply, as the apps do), from the buffer:
   * so the working copy on screen, with the step's choices, is written there
   * first. `publishedAt` and the slug are left alone (updating a card is not
   * re-publishing it); the cached pages and the recommendation index are
   * refreshed after the response.
   */
  async function applyUpdate() {
    const id = draftIdRef.current;
    if (pending || !id) return;
    if (!valuesRef.current.thoughtCore.trim()) {
      askForTitle();
      return;
    }
    setBusyVerb('publish');
    setPending(true);
    setPublishError(null);
    try {
      // The save queues behind any in-flight autosave and the apply behind the
      // save, so no straggling write can re-create the buffer after it's gone.
      // A failed save never reaches the apply.
      const run = saveDraft().then(() => applyPendingCardEdit(id));
      writeChainRef.current = run.catch(() => undefined);
      const result = await run;
      if (!result.applied) {
        // The buffer was gone by then (applied or discarded elsewhere), so the
        // text on screen may not be live and is kept nowhere: mark it unsaved,
        // so a retry, autosave or leaving writes it again.
        lastSavedRef.current = '';
        throw new Error('Changes were not applied');
      }
      setHasPendingEdit(false);
      closedRef.current = true;
      // A resonance these changes hid or unnamed was taken back with them: the connection with the original's
      // author may have ended, so what turns on the viewer's connections is read again.
      if (referenceCardId) refreshConnections();
      router.replace(`/card/${result.slug ?? initial?.slug ?? id}`);
    } catch (err) {
      closedRef.current = false;
      if (await confirmTrashed(err)) return;
      console.error('Save changes failed:', err);
      setPublishError(failure(err, tNative('saveError')));
    } finally {
      setPending(false);
    }
  }

  /** Throw the buffered revision away; the live card was never touched. */
  async function discardEdits() {
    const id = draftIdRef.current;
    if (pending || !id) return;
    setBusyVerb('leave');
    setPending(true);
    setPublishError(null);
    try {
      const run = writeChainRef.current.then(() => discardPendingCardEdit(id));
      writeChainRef.current = run.catch(() => undefined);
      await run;
      setHasPendingEdit(false);
      closedRef.current = true;
      router.replace(cardHref);
    } catch (err) {
      console.error('Discard edits failed:', err);
      closedRef.current = false;
      setPublishError(failure(err, tSafety('actionError')));
    } finally {
      setPending(false);
    }
  }

  /**
   * The explicit way out of a draft, in the publish step's foot. Autosave
   * already makes leaving safe, but "just close the window" is not something
   * anyone should have to infer — this gives the intent a button to land on.
   */
  async function saveDraftAndLeave() {
    if (pending) return;
    setBusyVerb('leave');
    setPending(true);
    setPublishError(null);
    try {
      if (needsSave()) await saveDraft();
      closedRef.current = true;
      (onLeave ?? leaveWriter)();
    } catch (err) {
      closedRef.current = false;
      if (await confirmTrashed(err)) return;
      console.error('Save draft failed:', err);
      setPublishError(failure(err, tNative('saveError')));
    } finally {
      setPending(false);
    }
  }

  /** Out of the trash, as it was: what was typed meanwhile is written at once. */
  async function restore() {
    const id = draftIdRef.current;
    if (!id || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreTrashedCard(id);
      setTrashed(false);
      trashedRef.current = false;
      if (!closedRef.current && needsSave()) await saveDraft();
    } catch (err) {
      console.error('Restore failed:', err);
      setRestoreError(tSafety('actionError'));
    } finally {
      setRestoring(false);
    }
  }

  useImperativeHandle(ref, () => ({
    hasWork() {
      const v = valuesRef.current;
      const unsaved = draftSnapshot(v) !== lastSavedRef.current;
      if (isPublished) return hasPendingEdit || unsaved;
      return !isEmptyDraft(v) && (draftIdRef.current != null || unsaved);
    },
    async saveNow() {
      if (!closedRef.current && !trashedRef.current && needsSave()) await saveDraft();
    },
    cardId() {
      return draftIdRef.current;
    },
    stepBack() {
      if (stepRef.current !== 'publish') return false;
      if (!pending) changeStep('write');
      return true;
    },
  }));

  const showCount = thoughtCore.length >= TITLE_COUNT_FROM && !titleError;

  return (
    <div ref={rootRef} className={styles.grid}>
      <div className={styles.column}>
        <div className={styles.write} hidden={step !== 'write'} data-returned={publishLoaded || undefined}>
          {trashed && (
            <div className={styles.trashed} role="status">
              <span className={styles.trashedLine}>{t('trashed.status')}</span>
              <OrganicButton variant="tonal" size="sm" loading={restoring} onClick={() => void restore()}>
                {tMe('restore')}
              </OrganicButton>
              {restoreError && <FieldHint tone="error">{restoreError}</FieldHint>}
            </div>
          )}

          {/* The title: one line of intent, in the card page's own title type. */}
          <div className={styles.titleBlock}>
            <div className={`${styles.title} story-title`} data-script={type.script}>
              <Textarea
                ref={titleRef}
                variant="bare"
                rows={1}
                autoGrow
                value={thoughtCore}
                lang={type.lang}
                aria-label={t('coreLabel')}
                aria-invalid={titleError || undefined}
                aria-describedby={titleError ? titleErrorId : undefined}
                placeholder={t('titlePlaceholder')}
                onFocus={() => (lastField.current = 'title')}
                onChange={(e) => {
                  setThoughtCore(oneLine(e.target.value));
                  setTitleError(false);
                }}
                onKeyDown={(e) => {
                  // Enter goes on to the story (an input method's Enter only picks its word).
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                  e.preventDefault();
                  storyRef.current?.focus(valuesRef.current.story.trim() ? 'end' : 'start');
                }}
              />
            </div>
            {titleError ? (
              <div id={titleErrorId} className={styles.titleNote} role="alert">
                <FieldHint tone="error">{t('titleRequired')}</FieldHint>
              </div>
            ) : (
              showCount && (
                <div className={styles.titleNote} data-full={thoughtCore.length >= TITLE_MAX || undefined}>
                  <CharCount count={thoughtCore.length} max={TITLE_MAX} />
                </div>
              )
            )}
          </div>

          {/* The story, set as the reader sets it. */}
          <MarkdownEditor
            variant="canvas"
            editorRef={storyRef}
            value={story}
            onChange={setStory}
            placeholder={t('storyPlaceholder')}
            ariaLabel={t('storyLabel')}
            seed={17}
            script={type.script}
            lang={type.lang}
            onUploadingChange={setStoryBusy}
            onFocusChange={(focused) => focused && (lastField.current = 'story')}
          />

          {saveError && (
            <p className={styles.saveError} role="alert">
              {saveError}
            </p>
          )}
        </div>

        {publishLoaded && (
          <div className={styles.publish} hidden={step !== 'publish'}>
            <PublishStep
              mode={isPublished ? 'update' : 'publish'}
              active={step === 'publish'}
              inlineHeading={inlineStepHeading}
              headingRef={setHeading}
              onBack={() => changeStep('write')}
              values={values}
              onTagsChange={setTags}
              onAudienceChange={(next) => {
                // One change, so no write is ever anonymous and for connections only.
                setVisibility(next.visibility);
                setAnonymous(next.anonymous);
              }}
              onCoverChange={(next, hue) => {
                setMedia(next);
                setAccentHue(hue);
              }}
              resonance={referenceCardId != null}
              liveReaches={
                isPublished &&
                reachesOriginal(
                  initial?.live?.visibility ?? initial?.visibility ?? 'public',
                  initial?.live?.anonymous ?? initial?.anonymous ?? false,
                )
              }
              storyBusy={storyBusy}
              pending={pending}
              busyVerb={busyVerb}
              error={publishError}
              onSubmit={() => void (isPublished ? applyUpdate() : submit())}
              onSecondary={() => void (isPublished ? discardEdits() : saveDraftAndLeave())}
              showSecondary={isPublished ? hasPendingEdit || draftSnapshot(values) !== lastSavedRef.current : true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

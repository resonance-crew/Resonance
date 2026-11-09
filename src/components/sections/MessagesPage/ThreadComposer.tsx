'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Textarea } from '@/components/atoms/Field/Field';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useToast } from '@/components/providers/ToastProvider';
import { preparePicture, UnsupportedImage, type PreparedPicture } from '@/lib/chat/preparePicture';
import { INK } from '@/lib/design/strokes';
import { wobCircle } from '@/lib/design/wobCircle';
import { wobRect } from '@/lib/design/wobRect';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { rememberedKeyboardHeight, useRememberKeyboardHeight } from '@/lib/hooks/useKeyboardHeight';
import { MESSAGE_MAX_LENGTH } from '@/lib/db/firestore/client/messages';
import { getCardById } from '@/lib/db/firestore/client/reads';
import type { Card, MessageReplyQuote } from '@/lib/db/types';
import { ALBUM_MAX, type ThreadDraft } from '@/lib/data/thread';
import { forgetChatDraft, keepChatDraft, readChatDraft } from '@/lib/data/chatDrafts';
import { noteRecentSticker, readRecentStickers } from '@/lib/data/stickerRecents';
import { stickerName, stickerPath, type StickerRef } from '@/lib/stickers/catalog';
import { ComposerCapsule, type CapsuleSegment } from './ComposerCapsule';
import { StickerPanel } from './StickerPanel';
import { StickerPicker } from './StickerPicker';
import { StickerPopover } from './StickerPopover';
import styles from './Thread.module.css';

// The card picker loads when it is first opened, not with the thread.
const InsertCardModal = dynamic(() =>
  import('@/components/molecules/MarkdownEditor/InsertCardModal').then((m) => m.InsertCardModal),
);

/** A mouse, and room for a popover: the stickers hang over the ☺ instead of taking the keyboard's place. */
const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 768px)';
/** At this many lines the field offers to grow (⤢, round 22 §4.3). */
export const EXPAND_AT_LINES = 3;
/** How long after the last keystroke a draft is kept. */
export const DRAFT_SAVE_MS = 500;
/** A second tap on the sticker just sent, this soon, is the old two-tap habit (round 23): it sends nothing more. */
export const STICKER_REPEAT_MS = 600;

/** What the thread can ask of its composer. */
export interface ThreadComposerHandle {
  /** Pictures dropped on the thread: they ride the next message, as picked ones do. */
  attachFiles(files: File[]): void;
  /** The conversation was deleted: its draft goes, and nothing writes it back. */
  forgetDraft(): void;
}

export interface ThreadComposerProps {
  /** The field, for the thread to focus (a reply chosen, a message sent). */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Whom the thread is with: the field's name. */
  otherHandle: string;
  /** The message the next one answers, and who wrote it (null: the viewer). */
  replyingTo: MessageReplyQuote | null;
  replyHandle: string | null;
  onCancelReply: () => void;
  /** A note being replied to — the first message quotes it. */
  replyNote?: { noteId: string; cardId: string };
  /** Hands the draft over to send; false when there was nothing to send. */
  send: (draft: ThreadDraft) => boolean;
  /** There is someone to send to (the conversation can be written to). */
  ready: boolean;
  /** Who writes, and in which conversation: what the draft is kept under (round 22 §4.4). */
  uid?: string;
  pairId?: string;
  /** A draft brought back answered this message: it is the thread's reply again. */
  onRestoreReply?: (quote: MessageReplyQuote) => void;
  /** Whether the thread holds message `id` unsent (a draft's quote of it is dropped). */
  isUnsent?: (id: string) => boolean;
  /**
   * How tall the composer (what rides it and the capsule) may grow, worked out by the thread: for the grown field
   * (option C), to just under the other person's last message (or the header, when that message is tall); for
   * the grown sticker panel, to just under the header.
   */
  expandRoom?: (purpose: 'field' | 'panel') => number | null;
  /** The field grew or shrank on purpose: the thread keeps the other's last message in view. */
  onExpandedChange?: (expanded: boolean) => void;
  /** What the thread can ask of it. */
  handle?: Ref<ThreadComposerHandle>;
  /** The reply's words pressed: the thread goes to the message it answers, and washes it (round 23). */
  onJumpToReply?: (messageId: string) => void;
  /** What the message being answered shows, small: its picture, or its card's cover (a sticker's is its own). */
  replyMedia?: string;
}

/** A picture waiting in the composer: ready to go up, and where its thumbnail draws it from. */
interface PendingPicture extends PreparedPicture {
  key: string;
  previewUrl: string;
}

/** What waits for a yes: a card in place of the pictures, or pictures in place of the card. */
type Replacing = { kind: 'card'; card: Card } | { kind: 'pictures'; files: File[] };

let pictureKeys = 0;

/**
 * The thread's composer, floating over the thread's foot (round 9 §4; round
 * 22): one capsule holding the 「＋」 that attaches (圖片 · 卡片 — pictures up
 * to ten at once, dropped on the thread or pasted too), the field — one line
 * at rest, growing to five with what is written, then scrolling with its
 * edges fading where more is; from three lines a ⤢ grows it on purpose as tall
 * as the thread lets it (option C) — the ☺ of the 小紙團 stickers, and Send
 * as the capsule's end segment (ComposerCapsule). On a phone the stickers take
 * the keyboard's place under the capsule (↑ in the send segment grows them,
 * when there is nothing to send); with a mouse they hang over the capsule. A
 * tap on a sticker sends it (round 23). What the next message carries (the
 * message it answers, a note it quotes, a card or pictures — one of the two, a
 * choice asked before one replaces the other) rides inside the capsule over
 * the text's line, Telegram's way (round 23): a row each — its mark over the
 * ＋, its words where the text starts, its ✕ over Send — and the pictures as a
 * strip of thumbnails. What is being written is kept as the conversation's
 * draft in this browser until it is sent. Its state lives here, so typing
 * never draws the thread above it again; sending never holds it.
 */
export function ThreadComposer({
  inputRef,
  otherHandle,
  replyingTo,
  replyHandle,
  onCancelReply,
  replyNote,
  send,
  ready,
  uid,
  pairId,
  onRestoreReply,
  isUnsent,
  expandRoom,
  onExpandedChange,
  handle,
  onJumpToReply,
  replyMedia,
}: ThreadComposerProps) {
  const t = useTranslations('messages');
  const tSafety = useTranslations('safety');
  const locale = useLocale();
  const toast = useToast();
  const [text, setText] = useState('');
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [pictures, setPictures] = useState<PendingPicture[]>([]);
  // Pictures being made ready (scaled on the device): sending waits for them.
  const [preparing, setPreparing] = useState(0);
  const [replacing, setReplacing] = useState<Replacing | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;
  const preparingRef = useRef(0);
  // A thumbnail's own copy of its picture goes when it does.
  const shown = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(pictures.map((p) => p.previewUrl));
    for (const url of shown.current) if (!now.has(url)) URL.revokeObjectURL(url);
    shown.current = now;
  }, [pictures]);
  useEffect(() => () => shown.current.forEach((url) => URL.revokeObjectURL(url)), []);

  /**
   * Pictures join the ones riding, in order, up to ten in all (past that, a word); one the browser can't read is
   * said so. They are made ready one at a time — ten full-size photos decoded at once can take an older phone's
   * tab down — each joining the strip as it is ready, and a later pick waits for the ones before it.
   */
  const prepQueue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const addPictures = useCallback(
    (files: File[]) => {
      const room = ALBUM_MAX - picturesRef.current.length - preparingRef.current;
      if (room <= 0) {
        toast.show({ message: t('picturesMax') });
        return Promise.resolve();
      }
      const take = files.slice(0, room);
      if (files.length > room) toast.show({ message: t('picturesMax') });
      preparingRef.current += take.length;
      setPreparing(preparingRef.current);
      const run = async () => {
        let unreadable = false;
        for (const file of take) {
          try {
            const ready = await preparePicture(file);
            if (alive.current) {
              setPictures((cur) =>
                [...cur, { ...ready, key: `p${++pictureKeys}`, previewUrl: URL.createObjectURL(ready.file) }].slice(0, ALBUM_MAX),
              );
            }
          } catch (err) {
            if (!(err instanceof UnsupportedImage)) console.error('Picture not prepared:', err);
            unreadable = true;
          }
          preparingRef.current -= 1;
          if (alive.current) setPreparing(preparingRef.current);
        }
        if (!alive.current) return;
        if (unreadable) toast.show({ message: t('imageUnsupported') });
        if (!panelOpenRef.current) inputRef.current?.focus();
      };
      const done = prepQueue.current.then(run);
      prepQueue.current = done.catch(() => undefined);
      return done;
    },
    [toast, t, inputRef],
  );

  /** Pictures picked, pasted or dropped: in place of a card only once the viewer says so. */
  const attachFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => !f.type || f.type.startsWith('image/'));
      if (!images.length) return;
      if (pendingCardRef.current) setReplacing({ kind: 'pictures', files: images });
      else void addPictures(images);
    },
    [addPictures],
  );
  const pendingCardRef = useRef(pendingCard);
  pendingCardRef.current = pendingCard;

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardModalLoaded = useOpenedOnce(cardModalOpen);
  // The note-reply quote rides the next message; dismissable if reconsidered.
  const [noteRef, setNoteRef] = useState(replyNote);
  useEffect(() => {
    if (replyNote) setNoteRef(replyNote);
  }, [replyNote?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- The stickers ------------------------------------------------------------------------------------------
  const desktop = useMediaQuery(DESKTOP);
  const [stickers, setStickers] = useState<'closed' | 'panel' | 'popover'>('closed');
  const panelOpen = stickers === 'panel';
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const [panelTall, setPanelTall] = useState(false);
  const [panelBase, setPanelBase] = useState(300);
  const [panelTallH, setPanelTallH] = useState(300);
  // The recents as the picker shows them: read as it opens and held while it is open (round 23 — a tap sends, and
  // a list reordering under the next tap would send another sticker); a sticker sent is stored at once.
  const [recents, setRecents] = useState<StickerRef[]>([]);
  const lastSticker = useRef<{ key: string; at: number } | null>(null);
  const smileRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Where the popover lay, for STICKER_REPEAT_MS after a sticker sent from it closed it: the old two-click habit's
  // second click lands on nothing there, never on the thread under it (a card, a link, a picture).
  const [catcher, setCatcher] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const catcherTimer = useRef<number | null>(null);
  const dropCatcher = useCallback(() => {
    if (catcherTimer.current != null) window.clearTimeout(catcherTimer.current);
    catcherTimer.current = null;
    setCatcher(null);
  }, []);
  useEffect(() => () => {
    if (catcherTimer.current != null) window.clearTimeout(catcherTimer.current);
  }, []);
  const stackRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [focused, setFocused] = useState(false);
  useRememberKeyboardHeight(focused && desktop === false);

  // The keyboard's going once the panel is laid out (a frame later): a close before that frame keeps the field.
  const keyboardAway = useRef(0);
  const closeStickers = useCallback((focusField: boolean) => {
    window.cancelAnimationFrame(keyboardAway.current);
    setStickers('closed');
    setPanelTall(false);
    if (focusField) inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);

  function toggleStickers() {
    if (stickers !== 'closed') {
      // ⌨ on a phone: back to the keyboard. ☺ again on a desktop: the popover goes, the field keeps writing.
      closeStickers(true);
      return;
    }
    if (uid) setRecents(readRecentStickers(uid));
    if (desktop) {
      dropCatcher();
      setStickers('popover');
      return;
    }
    // Laid out at the keyboard's height first, then the keyboard goes: the capsule doesn't dip between the two.
    setPanelBase(rememberedKeyboardHeight());
    setStickers('panel');
    keyboardAway.current = window.requestAnimationFrame(() => inputRef.current?.blur());
  }

  // Grown, the panel reaches to just under the thread's header (the capsule rides up with it) — measured again
  // whenever the capsule's height changes meanwhile (a sticker sent that took the reply riding with it: 98 → 48).
  const measureTall = useCallback(() => {
    const room = expandRoom?.('panel');
    const stack = stackRef.current?.offsetHeight ?? 48;
    if (room) setPanelTallH(Math.max(panelBase, room - stack + panelBase - 8));
  }, [expandRoom, panelBase]);
  useLayoutEffect(() => {
    if (!panelOpen) return;
    measureTall();
    const el = stackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureTall());
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelOpen, measureTall]);

  /**
   * A sticker tapped: it goes at once (round 23, the owner's: one tap). The same one tapped again within
   * STICKER_REPEAT_MS is the old two-tap habit and sends nothing more; two different ones may go back to back.
   * The popover closes, the field writing again; the panel stays.
   */
  function sendSticker(ref: StickerRef) {
    if (!ready) return;
    const key = `${ref.pack}/${ref.id}`;
    const now = Date.now();
    if (lastSticker.current?.key === key && now - lastSticker.current.at < STICKER_REPEAT_MS) return;
    if (!send({ text: '', sticker: ref })) return;
    lastSticker.current = { key, at: now };
    if (uid) noteRecentSticker(uid, ref);
    if (stickers === 'popover') {
      const box = popoverRef.current?.getBoundingClientRect();
      if (box) {
        dropCatcher();
        setCatcher({ top: box.top, left: box.left, width: box.width, height: box.height });
        catcherTimer.current = window.setTimeout(() => {
          catcherTimer.current = null;
          setCatcher(null);
        }, STICKER_REPEAT_MS);
      }
      closeStickers(true);
    }
  }

  // Escape closes the panel (the popover has its own).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeStickers(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closeStickers]);

  // Words in the field: no stickers beside them (the ☺ is gone with them).
  const hasWords = text.trim().length > 0;
  useEffect(() => {
    if (hasWords && stickers !== 'closed') closeStickers(false);
  }, [hasWords, stickers, closeStickers]);

  // A phone turned into a mouse's window (or back): the stickers start again in the right place.
  useEffect(() => {
    if (stickers === 'popover' && desktop === false) closeStickers(false);
    if (stickers === 'panel' && desktop) closeStickers(false);
  }, [desktop, stickers, closeStickers]);

  // --- Lines, fades, growing on purpose ------------------------------------------------------------------------
  const [lines, setLines] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [expandedH, setExpandedH] = useState<number | null>(null);
  const ridingRef = useRef<HTMLDivElement>(null);

  /** The text's edges fade where more of it lies beyond them (14 px, round 22 §4.3). */
  const fades = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    mark(el, 'data-fade-top', max > 1 && el.scrollTop > 1);
    mark(el, 'data-fade-bottom', max > 1 && el.scrollTop < max - 1);
  }, [inputRef]);

  /** The grown field's height: what the thread leaves the capsule, less the rows riding inside it over the text
   * (its room above and below the lines is the text box's own: it runs to the capsule's pen line). */
  const measureExpanded = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const room = expandRoom?.('field') ?? Math.round(window.innerHeight * 0.6);
    const riding = ridingRef.current?.offsetHeight ?? 0;
    setExpandedH(Math.max(line * 2 + 48, Math.round(room - riding)));
  }, [expandRoom, inputRef]);

  // Auto-grow: the field rests at one line and takes its height from what is written (the CSS caps it at five);
  // grown on purpose, it is as tall as the thread leaves it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (expanded && expandedH) {
      el.style.height = `${expandedH}px`;
    } else {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
    // Its lines: the text's height without the box's own room above and below them.
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 24;
    const room = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    setLines(Math.max(1, Math.round((el.scrollHeight - room) / line)));
    fades();
  }, [text, inputRef, expanded, expandedH, fades]);
  // Grown or shrunk with the caret at the end: the end stays in view (the height's change scrolled it away).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || el.selectionEnd !== el.value.length) return;
    el.scrollTop = el.scrollHeight;
    fades();
  }, [expanded, expandedH, inputRef, fades]);

  useLayoutEffect(() => {
    if (!expanded) return;
    measureExpanded();
    window.addEventListener('resize', measureExpanded);
    window.visualViewport?.addEventListener('resize', measureExpanded);
    return () => {
      window.removeEventListener('resize', measureExpanded);
      window.visualViewport?.removeEventListener('resize', measureExpanded);
    };
  }, [expanded, measureExpanded]);

  const expandedChange = useRef(onExpandedChange);
  expandedChange.current = onExpandedChange;
  const firstExpand = useRef(true);
  useEffect(() => {
    if (firstExpand.current) {
      firstExpand.current = false;
      return;
    }
    expandedChange.current?.(expanded);
  }, [expanded]);

  function setGrown(grown: boolean) {
    setExpanded(grown);
    if (!grown) setExpandedH(null);
    inputRef.current?.focus({ preventScroll: true });
  }

  // --- Drafts ------------------------------------------------------------------------------------------------
  // Restored once the account and the conversation are known; kept DRAFT_SAVE_MS after the last change, and at
  // once when the page is left; forgotten once sent, emptied or the conversation deleted.
  const restoredFor = useRef<string | null>(null);
  const restoringCard = useRef<string | null>(null);
  // The reply a draft brought back (not announced as one just chosen).
  const draftReply = useRef<string | null>(null);
  const dirty = useRef(false);
  const gone = useRef(false);
  const draftNow = useRef(() => ({ text: '', replyTo: undefined as MessageReplyQuote | undefined, noteRef, cardId: undefined as string | undefined }));
  draftNow.current = () => ({
    text,
    replyTo: replyingTo ?? undefined,
    noteRef,
    cardId: pendingCard?.id ?? restoringCard.current ?? undefined,
  });
  useEffect(() => {
    if (!uid || !pairId || restoredFor.current === `${uid}:${pairId}`) return;
    restoredFor.current = `${uid}:${pairId}`;
    const draft = readChatDraft(uid, pairId);
    if (!draft) return;
    setText(draft.text);
    if (draft.noteRef && !replyNote) setNoteRef(draft.noteRef);
    // A quote of a message known to be unsent is dropped here; the thread asks about it again as its messages come
    // (unsent, missing from the whole history, the conversation gone: ThreadView).
    if (draft.replyTo && !replyingTo && !isUnsent?.(draft.replyTo.id)) {
      draftReply.current = draft.replyTo.id;
      onRestoreReply?.(draft.replyTo);
    }
    if (draft.cardId) {
      const id = draft.cardId;
      restoringCard.current = id;
      void getCardById(id)
        .then((card) => {
          if (restoringCard.current !== id) return;
          restoringCard.current = null;
          if (card && !pendingCardRef.current && !picturesRef.current.length) setPendingCard(card);
        })
        .catch(() => {
          if (restoringCard.current === id) restoringCard.current = null;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, pairId]);

  const save = useCallback(() => {
    if (!uid || !pairId || gone.current || restoredFor.current !== `${uid}:${pairId}`) return;
    dirty.current = false;
    keepChatDraft(uid, pairId, draftNow.current());
  }, [uid, pairId]);
  useEffect(() => {
    if (!uid || !pairId || restoredFor.current !== `${uid}:${pairId}`) return;
    dirty.current = true;
    const id = window.setTimeout(save, DRAFT_SAVE_MS);
    return () => window.clearTimeout(id);
  }, [text, pendingCard?.id, noteRef?.noteId, replyingTo?.id, uid, pairId, save]);
  // Leaving: kept at once (only what wasn't yet — a draft forgotten by a sign-out or a deletion stays gone).
  useEffect(() => {
    const flush = () => {
      if (dirty.current) save();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [save]);

  useImperativeHandle(
    handle,
    () => ({
      attachFiles,
      forgetDraft: () => {
        gone.current = true;
        dirty.current = false;
        if (uid && pairId) forgetChatDraft(uid, pairId);
      },
    }),
    [attachFiles, uid, pairId],
  );

  // --- Sending -----------------------------------------------------------------------------------------------
  const trimmed = text.trim();
  const hasContent = trimmed.length > 0 || !!pendingCard || pictures.length > 0;
  const valid = ready && preparing === 0 && hasContent && trimmed.length <= MESSAGE_MAX_LENGTH;

  function submit() {
    if (!valid) return;
    const images = pictures.map(({ file, width, height }) => ({ file, width, height }));
    const ok = send({
      text: trimmed,
      cardRef: pendingCard?.id,
      noteRef,
      ...(images.length > 1 ? { images } : images.length === 1 ? { image: images[0] } : {}),
    });
    if (!ok) return;
    setText('');
    setPendingCard(null);
    setPictures([]);
    setNoteRef(undefined);
    restoringCard.current = null;
    dirty.current = false;
    if (uid && pairId) forgetChatDraft(uid, pairId);
    if (expanded) setGrown(false);
    // With the stickers in the keyboard's place, they stay; otherwise the field is ready for the next.
    if (!panelOpen) inputRef.current?.focus();
  }

  // --- What rides along ----------------------------------------------------------------------------------------
  // A reply chosen is said once to a screen reader (「回覆 bob」), the focus staying in the field; one brought back
  // with a draft is not news — until it is put away or another takes its place: chosen again, it is said.
  const [said, setSaid] = useState('');
  const replyId = replyingTo?.id ?? null;
  const replySeen = useRef<string | null>(replyId);
  useEffect(() => {
    if (draftReply.current && replySeen.current === draftReply.current && replyId !== draftReply.current) draftReply.current = null;
    // The region empties whenever the reply changes or goes: nothing stale stays to be read later.
    setSaid('');
    if (!replyId || replyId === replySeen.current || replyId === draftReply.current) {
      replySeen.current = replyId;
      return;
    }
    replySeen.current = replyId;
    const words = replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf');
    // Said on the next frame, after the emptying: the same words for another reply still change the region.
    const frame = window.requestAnimationFrame(() => setSaid(words));
    // Said, then gone from the page.
    const id = window.setTimeout(() => setSaid(''), 1500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(id);
      setSaid('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyId]);

  // The send segment: Send — or, with the panel open and nothing to send, ↑ / ↓ for the panel.
  const segment: CapsuleSegment = panelOpen && !hasContent ? (panelTall ? 'collapse' : 'expand') : 'send';
  const carries = !!(replyingTo || noteRef || pendingCard || pictures.length);
  const picker = <StickerPicker recents={recents} onPick={sendSticker} variant={desktop ? 'popover' : 'panel'} gridRef={gridRef} />;
  // The second line of the reply's row: its words, a picture, a card — a sticker this build knows is its key frame
  // alone (round 22, the owner's notes: no name beside it); one it doesn't, its fallback words.
  const replySticker = replyingTo?.sticker && !replyingTo.unsent ? stickerName(replyingTo.sticker, locale) : null;
  const replyDetail = !replyingTo
    ? ''
    : replyingTo.unsent
      ? t('unsentQuote')
      : replyingTo.sticker
        ? replySticker
          ? undefined
          : replyingTo.text || t('stickerUnknown')
        : replyingTo.text || (replyingTo.image ? t('replyImage') : t('replyCard'));
  // What the answered message shows, small, before the words (Telegram's photo reply): a sticker's key frame,
  // quieter, or its picture or card's cover.
  const replyThumb =
    replyingTo && !replyingTo.unsent
      ? replyingTo.sticker && replySticker
        ? { src: stickerPath(replyingTo.sticker, 'thumb'), sticker: true }
        : replyMedia
          ? { src: replyMedia, sticker: false }
          : null
      : null;
  // From its second line — or with anything riding — the send segment is a block on the last row; from the third ⤢
  // stands in its column, at the text's top.
  const block = lines > 1 || expanded || carries;
  // A sticker isn't sent with words: with words in the field the ☺ steps aside and the field takes its room.
  const offersStickers = trimmed.length === 0;
  const focusField = () => inputRef.current?.focus({ preventScroll: true });

  const riding = carries ? (
    <>
      {replyingTo && (
        <CarryRow
          mark={<CarryRule />}
          media={
            replyThumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={replyThumb.sticker ? styles.carrySticker : styles.carryMedia} src={replyThumb.src} alt="" draggable={false} />
            )
          }
          label={replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf')}
          detail={replyDetail}
          onWords={onJumpToReply ? () => onJumpToReply(replyingTo.id) : undefined}
          removeLabel={t('replyCancel')}
          onRemove={onCancelReply}
        />
      )}
      {noteRef && (
        <CarryRow mark={<CarryTile icon="note" />} label={t('quotedNote')} removeLabel={t('removeNote')} onRemove={() => setNoteRef(undefined)} />
      )}
      {pendingCard && (
        <CarryRow
          mark={<CarryTile icon="cards" picture={pendingCard.media?.type === 'image' ? pendingCard.media.url : undefined} />}
          label={!pendingCard.publishedAt || pendingCard.visibility === 'private' ? t('privateCard') : t('attachCardShort')}
          detail={pendingCard.thoughtCore}
          removeLabel={t('removeCard')}
          onRemove={() => setPendingCard(null)}
        />
      )}
      {/* The pictures (round 22, the owner's notes — iOS's way on every platform): their thumbnails in a row,
          each taken back by the small round ✕ on its corner; no numbers, no count, no ✕ for them all. */}
      {pictures.length > 0 && (
        <PictureStrip
          pictures={pictures}
          removeLabel={(i) => (pictures.length > 1 ? t('removeImageAt', { n: i + 1 }) : t('removeImage'))}
          onRemove={(key) => setPictures((cur) => cur.filter((x) => x.key !== key))}
        />
      )}
    </>
  ) : null;

  return (
    <>
      <div
        ref={stackRef}
        className={styles.composerStack}
        // A press anywhere in the capsule but on a control writes in the field (round 23): its rows and its room
        // round the text never take the focus from it, so a phone's keyboard stays up.
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, a, input, textarea, [role="menu"]') || !capsuleRef.current?.contains(target)) return;
          e.preventDefault();
          focusField();
        }}
        onKeyDown={(e) => {
          // Escape puts the reply away when nothing else is open over the field: a panel, the popover or the ＋'s
          // menu (a portal whose keys reach here through React) goes first.
          if (e.key !== 'Escape' || e.defaultPrevented || !replyingTo || stickers !== 'closed') return;
          const capsule = capsuleRef.current;
          if (!capsule?.contains(e.target as Node) || capsule.querySelector('[aria-expanded="true"]')) return;
          e.preventDefault();
          onCancelReply();
          focusField();
        }}
      >
        <ComposerCapsule
          capsuleRef={capsuleRef}
          focused={focused}
          ready={valid}
          segment={segment}
          sendLabel={segment === 'expand' ? t('stickerPanelExpand') : segment === 'collapse' ? t('stickerPanelCollapse') : t('send')}
          onSend={() => (segment === 'send' ? submit() : setPanelTall(segment === 'expand'))}
          expanded={expanded}
          block={block}
          riding={riding}
          ridingLabel={t('composerRiding')}
          ridingRef={ridingRef}
          aboveSend={
            (lines >= EXPAND_AT_LINES || expanded) && (
              <GrowButton expanded={expanded} label={expanded ? t('collapseComposer') : t('expandComposer')} onClick={() => setGrown(!expanded)} />
            )
          }
        >
          <span className={styles.plusSlot}>
            <OrganicMenu
              bare
              tone="muted"
              triggerIcon="plus"
              label={t('attach')}
              floating
              align="start"
              seed={17}
              items={[
                { key: 'image', icon: 'image', label: t('attachImage') },
                { key: 'card', icon: 'cards', label: t('attachCardShort') },
              ]}
              onChoose={(key) => {
                if (key === 'image') fileRef.current?.click();
                else setCardModalOpen(true);
              }}
            />
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.fileInput}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              if (files.length) attachFiles(files);
              e.currentTarget.value = '';
            }}
          />
          {/* The field's room: one line centred in the capsule's 48 by its own padding, so a scrolled field's
              lines stop at it, never under the capsule's pen. A press in that room writes in the field. */}
          <div className={styles.composerField}>
            <Textarea
              ref={inputRef}
              // No frame of its own: the capsule is its frame (the underline variant, its line taken off here).
              variant="subtle"
              className={styles.composerInput}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={fades}
              onFocus={() => {
                setFocused(true);
                // Writing again: the keyboard takes its place back from the stickers.
                if (panelOpenRef.current) closeStickers(false);
              }}
              onBlur={() => setFocused(false)}
              onPaste={(e) => {
                // Pictures pasted ride along, as picked ones do; words paste as words.
                const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
                if (!files.length) return;
                e.preventDefault();
                attachFiles(files);
              }}
              onKeyDown={(e) => {
                // The Enter that commits a word being composed (Zhuyin, Pinyin) isn't a send: Safari hands it
                // over after the composition ended, known only by its key code.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t('placeholder')}
              aria-label={t('threadWith', { handle: otherHandle })}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
            />
          </div>
          {/* The ☺ on the last line's row beside Send, while the field is empty (⌨ while the panel is open). */}
          {offersStickers && (
            <span className={styles.toolsSlot}>
              <span ref={smileRef} className={styles.stickerTool}>
                <BareIconButton
                  icon={panelOpen ? 'keyboard' : 'smile'}
                  label={panelOpen ? t('keyboard') : t('stickers')}
                  iconSize={22}
                  tipAlign="end"
                  seed={29}
                  expanded={stickers !== 'closed'}
                  haspopup={desktop ? 'dialog' : undefined}
                  onClick={toggleStickers}
                />
              </span>
            </span>
          )}
        </ComposerCapsule>

        {/* Said once to a screen reader: a reply chosen (the focus stays in the field). */}
        <span className={styles.srOnly} aria-live="polite">
          {said}
        </span>
      </div>

      {panelOpen && (
        <StickerPanel base={panelBase} tall={panelTallH} isTall={panelTall} gridRef={gridRef}>
          {picker}
        </StickerPanel>
      )}

      {/* With a mouse the stickers hang over the capsule's top edge — over what rides in it too, never on it. */}
      {stickers === 'popover' && smileRef.current && capsuleRef.current && (
        <StickerPopover anchor={smileRef.current} above={capsuleRef.current} boxRef={popoverRef} onClose={() => closeStickers(true)}>
          {picker}
        </StickerPopover>
      )}
      {/* Gone with the sticker sent, the popover's place takes the next click for a moment, quietly: the field
          keeps writing (a press here takes no focus) and nothing under it hears the click. */}
      {catcher &&
        createPortal(
          <div
            className={styles.clickCatcher}
            data-click-catcher=""
            aria-hidden
            style={catcher}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />,
          document.body,
        )}

      {cardModalLoaded && (
        <InsertCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          title={t('pickCard')}
          subtitle={t('pickCardSubtitle')}
          privateLabel={t('privateCard')}
          empty={t('pickCardEmpty')}
          selectedId={pendingCard?.id ?? null}
          onPick={(card) => {
            setCardModalOpen(false);
            // One of the two: a card in place of pictures — once the viewer says so.
            if (picturesRef.current.length) setReplacing({ kind: 'card', card });
            else setPendingCard(card);
          }}
        />
      )}

      <ConfirmModal
        open={!!replacing}
        title={replacing?.kind === 'card' ? t('replaceWithCardTitle') : t('replaceWithPicturesTitle')}
        body={replacing?.kind === 'card' ? t('replaceWithCardBody') : t('replaceWithPicturesBody')}
        cancelLabel={tSafety('cancel')}
        confirmLabel={replacing?.kind === 'card' ? t('replaceWithCardConfirm') : t('replaceWithPicturesConfirm')}
        onCancel={() => setReplacing(null)}
        onConfirm={() => {
          const r = replacing;
          setReplacing(null);
          if (!r) return;
          if (r.kind === 'card') {
            setPictures([]);
            setPendingCard(r.card);
          } else {
            setPendingCard(null);
            restoringCard.current = null;
            void addPictures(r.files);
          }
        }}
        seed={71}
      />
    </>
  );
}

function mark(el: HTMLElement, attr: string, on: boolean) {
  if (on) {
    if (!el.hasAttribute(attr)) el.setAttribute(attr, '');
  } else if (el.hasAttribute(attr)) el.removeAttribute(attr);
}

/** A reply's mark: a short wavy pen rule in terracotta, over the ＋'s column. */
function CarryRule() {
  return (
    <span className={styles.carryRule} aria-hidden>
      <Divider orientation="vertical" seed={31} amplitude={1.1} strokeWidth={INK} color="var(--color-terracotta)" spacing={0} />
    </span>
  );
}

/** Keeps the field's focus through a press (round 23): a phone's keyboard stays up, nothing under it moves. */
const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();

/**
 * One thing riding the next message, inside the capsule over the text's line (round 23, Telegram's way): the
 * capsule's three columns run through it — its mark (the reply's wavy rule, a note's glyph, a card's cover) in
 * the ＋'s, whom or what (and a line of it) where the text starts, a reply's picture or sticker first when it has
 * one, and its ✕ centred over Send. A reply's words go to the message it answers (`onWords`); the others' write
 * in the field (the stack's press).
 */
function CarryRow({
  mark,
  media,
  label,
  detail,
  onWords,
  removeLabel,
  onRemove,
}: {
  mark: ReactNode;
  media?: ReactNode;
  label: string;
  detail?: string;
  onWords?: () => void;
  removeLabel: string;
  onRemove: () => void;
}) {
  const words = (
    <>
      {media}
      <span className={styles.carryText}>
        <span className={styles.carryLabel}>{label}</span>
        {detail && <span className={styles.carryDetail}>{detail}</span>}
      </span>
    </>
  );
  return (
    <div className={styles.carryRow}>
      <span className={styles.carryMark}>{mark}</span>
      {onWords ? (
        <button type="button" className={styles.carryWords} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={onWords}>
          {words}
        </button>
      ) : (
        <span className={styles.carryWords}>{words}</span>
      )}
      <span className={styles.carryRemove}>
        <BareIconButton icon="close" label={removeLabel} iconSize={16} tipAlign="end" keepFocus onClick={onRemove} />
      </span>
    </div>
  );
}

/** A row's 32 × 32 mark: the picture when there is one, else `icon` on the tonal tile. */
function CarryTile({ icon, picture }: { icon?: IconName; picture?: string }) {
  return (
    <span className={styles.carryTile} aria-hidden>
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" />
      ) : (
        icon && <Icon name={icon} size={16} color="var(--color-terracotta)" />
      )}
    </span>
  );
}

/**
 * The pictures riding, inside the capsule (round 23): a strip across its inner width, 8 clear of its pen line all
 * round, of 56 thumbnails — each taken back by its own small ✕ on its corner (round 22: no numbers, no count, no ✕
 * for them all) — scrolling sideways when they are more than it, its edges fading where more of them lie; a
 * mouse's wheel scrolls it sideways too.
 */
function PictureStrip({
  pictures,
  removeLabel,
  onRemove,
}: {
  pictures: readonly PendingPicture[];
  removeLabel: (index: number) => string;
  onRemove: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const edges = useEdgeFades(ref, 'x');
  // A wheel turned up or down over the strip moves it sideways (a mouse has no other way), while there is more of
  // it that way; past its end the wheel is the thread's again.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div ref={edges} className={styles.carryStrip}>
      {pictures.map((p, i) => (
        <span key={p.key} className={styles.carryThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.previewUrl} alt="" draggable={false} />
          <ThumbRemove label={removeLabel(i)} seed={41 + i * 7} onClick={() => onRemove(p.key)} />
        </span>
      ))}
    </div>
  );
}

/**
 * A picture's own ✕ on its thumbnail's top-right corner (round 22, the owner's notes): a small round button of
 * the viewer's dark with a cream ✕ — its outline only a touch hand-drawn (a neat disc, not a blob), a finger's
 * 32 round it unseen. A press keeps the field's focus.
 */
function ThumbRemove({ label, seed, onClick }: { label: string; seed: number; onClick: () => void }) {
  const disc = useMemo(() => wobCircle(12, 12, 10.5, seed, { segments: 10, mag: 0.35, cpJitter: 0.12 }), [seed]);
  return (
    <button
      type="button"
      className={styles.thumbRemove}
      aria-label={label}
      title={label}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      <svg className={styles.thumbDisc} viewBox="0 0 24 24" aria-hidden="true">
        <path d={disc} />
      </svg>
      <Icon name="close" size={11} color="currentColor" strokeWidth={INK} />
    </button>
  );
}

/** The grow button: the capsule's one tool size (the ＋'s, the ☺'s), 44 × 48, its glyph centred. */
export const TOOL_W = 44;
export const TOOL_H = 48;

/**
 * ⤢ / ⤡ (round 22, the owner's notes): a ghost button in the send column at the text's top (the capsule's
 * top-right, or under what rides along, round 23), the capsule's one tool size —
 * no fill and no outline at rest; under a pointer, the keyboard's focus or a press, a soft square of ink (a
 * hand-drawn rounded square, as the bare glyphs' disc), the glyph centred.
 */
function GrowButton({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  const wash = useMemo(() => wobRect(TOOL_W, TOOL_H, 12, 19, 0.9, { segmentsH: 1, segmentsV: 1, curve: 1 }), []);
  return (
    <button type="button" className={styles.growTool} aria-label={label} title={label} onClick={onClick}>
      <svg className={styles.growWash} viewBox={`0 0 ${TOOL_W} ${TOOL_H}`} aria-hidden="true">
        <path d={wash} />
      </svg>
      <Icon name={expanded ? 'collapse' : 'expand'} size={18} color="currentColor" strokeWidth={INK} />
    </button>
  );
}

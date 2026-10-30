'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
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
import { StickerPreview } from './StickerPreview';
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
 * when there is nothing to send); with a mouse they hang over the ☺. A
 * sticker picked is previewed, moving; picked again (or its preview tapped) it
 * goes. What the next message carries (the message it answers, a note it
 * quotes, a card or pictures — one of the two, a choice asked before one
 * replaces the other) rides just over it, a row each in the reply's style.
 * What is being written is kept as the conversation's draft in this browser
 * until it is sent. Its state lives here, so typing never draws the thread
 * above it again; sending never holds it.
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

  /** Pictures join the ones riding, in order, up to ten in all (past that, a word); one the browser can't read is said so. */
  const addPictures = useCallback(
    async (files: File[]) => {
      const room = ALBUM_MAX - picturesRef.current.length - preparingRef.current;
      if (room <= 0) {
        toast.show({ message: t('picturesMax') });
        return;
      }
      const take = files.slice(0, room);
      if (files.length > room) toast.show({ message: t('picturesMax') });
      preparingRef.current += take.length;
      setPreparing(preparingRef.current);
      const made = await Promise.allSettled(take.map((f) => preparePicture(f)));
      preparingRef.current -= take.length;
      setPreparing(preparingRef.current);
      const ready = made.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (made.some((r) => r.status === 'rejected')) {
        const err = made.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
        if (!(err instanceof UnsupportedImage)) console.error('Picture not prepared:', err);
        toast.show({ message: t('imageUnsupported') });
      }
      if (!ready.length) return;
      setPictures((cur) => [
        ...cur,
        ...ready.map((p) => ({ ...p, key: `p${++pictureKeys}`, previewUrl: URL.createObjectURL(p.file) })),
      ].slice(0, ALBUM_MAX));
      if (!panelOpenRef.current) inputRef.current?.focus();
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
  const [preview, setPreview] = useState<StickerRef | null>(null);
  const [recents, setRecents] = useState<StickerRef[]>([]);
  const smileRef = useRef<HTMLSpanElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (uid) setRecents(readRecentStickers(uid));
  }, [uid]);

  const [focused, setFocused] = useState(false);
  useRememberKeyboardHeight(focused && desktop === false);

  const closeStickers = useCallback((focusField: boolean) => {
    setStickers('closed');
    setPanelTall(false);
    setPreview(null);
    if (focusField) inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);

  function toggleStickers() {
    if (stickers !== 'closed') {
      // ⌨ on a phone: back to the keyboard. ☺ again on a desktop: the popover goes, the field keeps writing.
      closeStickers(true);
      return;
    }
    if (desktop) {
      setStickers('popover');
      return;
    }
    // Laid out at the keyboard's height first, then the keyboard goes: the capsule doesn't dip between the two.
    setPanelBase(rememberedKeyboardHeight());
    setStickers('panel');
    window.requestAnimationFrame(() => inputRef.current?.blur());
  }

  // Grown, the panel reaches to just under the thread's header (the capsule rides up with it).
  const measureTall = useCallback(() => {
    const room = expandRoom?.('panel');
    const stack = stackRef.current?.offsetHeight ?? 48;
    if (room) setPanelTallH(Math.max(panelBase, room - stack + panelBase - 8));
  }, [expandRoom, panelBase]);
  useLayoutEffect(() => {
    if (panelOpen) measureTall();
  }, [panelOpen, measureTall]);

  function sendSticker(ref: StickerRef) {
    if (!ready) return;
    if (!send({ text: '', sticker: ref })) return;
    setPreview(null);
    if (uid) setRecents(noteRecentSticker(uid, ref));
  }

  function pickSticker(ref: StickerRef) {
    // Picked again: it goes. Otherwise it is previewed, moving.
    if (preview && preview.pack === ref.pack && preview.id === ref.id) sendSticker(ref);
    else setPreview(ref);
  }

  // A press anywhere but the preview or a sticker puts the preview away.
  useEffect(() => {
    if (!preview) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-sticker-preview], [data-sticker]')) return;
      setPreview(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [preview]);

  // Escape closes the panel (the popover has its own); the preview first.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (preview) setPreview(null);
      else closeStickers(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, preview, closeStickers]);

  // A phone turned into a mouse's window (or back): the stickers start again in the right place.
  useEffect(() => {
    if (stickers === 'popover' && desktop === false) closeStickers(false);
    if (stickers === 'panel' && desktop) closeStickers(false);
  }, [desktop, stickers, closeStickers]);

  // --- Lines, fades, growing on purpose ------------------------------------------------------------------------
  const [lines, setLines] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [expandedH, setExpandedH] = useState<number | null>(null);
  const carryRef = useRef<HTMLDivElement>(null);

  /** The text's edges fade where more of it lies beyond them (14 px, round 22 §4.3). */
  const fades = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    mark(el, 'data-fade-top', max > 1 && el.scrollTop > 1);
    mark(el, 'data-fade-bottom', max > 1 && el.scrollTop < max - 1);
  }, [inputRef]);

  /** The grown field's height: what the thread leaves it, less what rides over it and the field's own padding. */
  const measureExpanded = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const room = expandRoom?.('field') ?? Math.round(window.innerHeight * 0.6);
    const carry = carryRef.current ? carryRef.current.offsetHeight + 6 : 0;
    setExpandedH(Math.max(line * 3, Math.round(room - carry - (48 - line))));
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
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    setLines(Math.max(1, Math.round(el.scrollHeight / line)));
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
    // A quote of a message unsent since is dropped.
    if (draft.replyTo && !replyingTo && !isUnsent?.(draft.replyTo.id)) onRestoreReply?.(draft.replyTo);
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

  // The send segment: Send — or, with the panel open and nothing to send, ↑ / ↓ for the panel.
  const segment: CapsuleSegment = panelOpen && !hasContent ? (panelTall ? 'collapse' : 'expand') : 'send';
  const carries = !!(replyingTo || noteRef || pendingCard || pictures.length);
  const picker = (
    <StickerPicker recents={recents} selected={preview} onPick={pickSticker} variant={desktop ? 'popover' : 'panel'} gridRef={gridRef} />
  );
  // The second line of the reply's row: its words — or a sticker's name, a picture, a card.
  const replySticker = replyingTo?.sticker ? stickerName(replyingTo.sticker, locale) : null;
  const replyDetail = !replyingTo
    ? ''
    : replyingTo.unsent
      ? t('unsentQuote')
      : replyingTo.sticker
        ? replySticker
          ? t('stickerLabel', { name: replySticker })
          : t('stickerUnknown')
        : replyingTo.text || (replyingTo.image ? t('replyImage') : t('replyCard'));

  return (
    <>
      <div ref={stackRef} className={styles.composerStack}>
        {/* What rides the next message — the message it answers, then a note, a card or pictures — as rows in the
            reply's style straight on the foot's paper, over the capsule, which keeps its exact shape whatever it
            carries (round 10 §3.4). */}
        {carries && (
          <div ref={carryRef} className={styles.carry}>
            {replyingTo && (
              <CarryRow
                lead={
                  replyingTo.sticker && replySticker ? (
                    <span className={styles.carryRuleWith}>
                      <CarryRule />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className={styles.carrySticker} src={stickerPath(replyingTo.sticker, 'thumb')} alt="" />
                    </span>
                  ) : (
                    <CarryRule />
                  )
                }
                label={replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf')}
                detail={replyDetail}
                removeLabel={t('replyCancel')}
                onRemove={onCancelReply}
              />
            )}
            {noteRef && (
              <CarryRow
                lead={<CarryTile icon="note" />}
                label={t('quotedNote')}
                removeLabel={t('removeCard')}
                onRemove={() => setNoteRef(undefined)}
              />
            )}
            {pendingCard && (
              <CarryRow
                lead={<CarryTile icon="cards" picture={pendingCard.media?.type === 'image' ? pendingCard.media.url : undefined} />}
                label={!pendingCard.publishedAt || pendingCard.visibility === 'private' ? t('privateCard') : t('attachCardShort')}
                detail={pendingCard.thoughtCore}
                removeLabel={t('removeCard')}
                onRemove={() => setPendingCard(null)}
              />
            )}
            {pictures.length === 1 && (
              <CarryRow
                lead={<CarryTile picture={pictures[0].previewUrl} />}
                label={t('attachImage')}
                removeLabel={t('removeImage')}
                onRemove={() => setPictures([])}
              />
            )}
            {pictures.length > 1 && (
              <CarryRow
                lead={
                  <span className={styles.carryStrip}>
                    {pictures.map((p, i) => (
                      <span key={p.key} className={styles.carryThumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.previewUrl} alt="" />
                        <span className={styles.carryOrder} aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className={styles.carryThumbRemove}>
                          <BareIconButton
                            icon="close"
                            label={`${t('removeImage')} ${i + 1}`}
                            iconSize={11}
                            tone="onDark"
                            tip={false}
                            onClick={() => setPictures((cur) => cur.filter((x) => x.key !== p.key))}
                          />
                        </span>
                      </span>
                    ))}
                  </span>
                }
                label={t('picturesCount', { count: pictures.length })}
                removeLabel={t('removeImage')}
                onRemove={() => setPictures([])}
              />
            )}
          </div>
        )}

        <ComposerCapsule
          focused={focused}
          ready={valid}
          segment={segment}
          sendLabel={segment === 'expand' ? t('stickerPanelExpand') : segment === 'collapse' ? t('stickerPanelCollapse') : t('send')}
          onSend={() => (segment === 'send' ? submit() : setPanelTall(segment === 'expand'))}
          expanded={expanded}
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
          <div
            className={styles.composerField}
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              inputRef.current?.focus();
            }}
          >
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
                } else if (e.key === 'Escape' && replyingTo) {
                  // Only the reply is put away (not a search open over the thread).
                  e.preventDefault();
                  onCancelReply();
                }
              }}
              placeholder={t('placeholder')}
              aria-label={t('threadWith', { handle: otherHandle })}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
            />
          </div>
          {/* ⤢ at the field's top from its third line (⤡ while grown), the ☺ on the last line's row beside Send. */}
          <span className={styles.toolsSlot}>
            {(lines >= EXPAND_AT_LINES || expanded) && (
              <span className={styles.growTool}>
                <BareIconButton
                  icon={expanded ? 'collapse' : 'expand'}
                  label={expanded ? t('collapseComposer') : t('expandComposer')}
                  iconSize={16}
                  tipAlign="end"
                  seed={19}
                  onClick={() => setGrown(!expanded)}
                />
              </span>
            )}
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
        </ComposerCapsule>

        {/* A sticker picked on a phone: moving on its sheet over the thread's foot, above the capsule. */}
        {preview && panelOpen && (
          <div className={styles.previewSlot}>
            <StickerPreview sticker={preview} placement="foot" onSend={() => sendSticker(preview)} />
          </div>
        )}
        {/* Said once to a screen reader as a sticker is previewed (there while the stickers are open, so it is heard). */}
        {stickers !== 'closed' && (
          <span className={styles.srOnly} role="status" aria-live="polite">
            {preview ? t('stickerPreviewA11y', { name: stickerName(preview, locale) ?? '' }) : ''}
          </span>
        )}
      </div>

      {panelOpen && (
        <StickerPanel base={panelBase} tall={panelTallH} isTall={panelTall} onTallChange={setPanelTall} gridRef={gridRef}>
          {picker}
        </StickerPanel>
      )}

      {stickers === 'popover' && smileRef.current && (
        <StickerPopover anchor={smileRef.current} onClose={() => closeStickers(true)}>
          {picker}
          {preview && (
            <div className={styles.popoverPreview}>
              <StickerPreview sticker={preview} placement="popover" onSend={() => sendSticker(preview)} />
            </div>
          )}
        </StickerPopover>
      )}

      {cardModalLoaded && (
        <InsertCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          title={t('pickCard')}
          subtitle={t('pickCardSubtitle')}
          privateLabel={t('privateCard')}
          empty={t('pickCardEmpty')}
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

/** A reply's lead: a short wavy pen rule in terracotta. */
function CarryRule() {
  return (
    <span className={styles.carryRule} aria-hidden>
      <Divider orientation="vertical" seed={31} amplitude={1.1} strokeWidth={INK} color="var(--color-terracotta)" spacing={0} />
    </span>
  );
}

/**
 * One thing riding the next message, in the reply's style (round 10 §3.4): what it is at the start — the reply's
 * wavy rule, a picture's thumbnail (pictures' strip), a card's cover or a glyph on a tonal tile — then whom or
 * what (and a line of it), and its ✕ at the end.
 */
function CarryRow({
  lead,
  label,
  detail,
  removeLabel,
  onRemove,
}: {
  lead: ReactNode;
  label: string;
  detail?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className={styles.carryRow}>
      {lead}
      <span className={styles.carryText}>
        <span className={styles.carryLabel}>{label}</span>
        {detail && <span className={styles.carryDetail}>{detail}</span>}
      </span>
      <span className={styles.carryRemove}>
        <BareIconButton icon="close" label={removeLabel} iconSize={16} tipAlign="end" onClick={onRemove} />
      </span>
    </div>
  );
}

/** A row's 40 × 40 lead: the picture when there is one, else `icon` on the tonal tile. */
function CarryTile({ icon, picture }: { icon?: IconName; picture?: string }) {
  return (
    <span className={styles.carryTile} aria-hidden>
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" />
      ) : (
        icon && <Icon name={icon} size={18} color="var(--color-terracotta)" />
      )}
    </span>
  );
}

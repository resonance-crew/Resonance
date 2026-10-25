'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Textarea } from '@/components/atoms/Field/Field';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useToast } from '@/components/providers/ToastProvider';
import { preparePicture, UnsupportedImage, type PreparedPicture } from '@/lib/chat/preparePicture';
import { INK } from '@/lib/design/strokes';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import { MESSAGE_MAX_LENGTH } from '@/lib/db/firestore/client/messages';
import type { Card, MessageReplyQuote } from '@/lib/db/types';
import type { ThreadDraft } from '@/lib/data/thread';
import { ComposerCapsule } from './ComposerCapsule';
import styles from './Thread.module.css';

// The card picker loads when it is first opened, not with the thread.
const InsertCardModal = dynamic(() =>
  import('@/components/molecules/MarkdownEditor/InsertCardModal').then((m) => m.InsertCardModal),
);

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
}

/** A picture waiting in the composer: ready to go up, and where its chip draws it from. */
interface PendingPicture extends PreparedPicture {
  previewUrl: string;
}

/**
 * The thread's composer, floating over the thread's foot (round 9 §4): one
 * capsule holding the 「＋」 that attaches (圖片 · 卡片, the one organic menu;
 * a picture can be pasted too), the field — one line at rest, growing to five
 * with what is written — and Send as the capsule's end segment
 * (ComposerCapsule). What the next message carries (the message it answers, a
 * note it quotes, a card or a picture — one of the two) rides just over it,
 * a row each in the reply's style, its ✕ at the end. Its draft lives here, so typing never draws the
 * thread above it again; sending never holds it (the message goes out behind
 * any still on their way, and the field is ready at once — a picture goes up
 * as it is sent).
 */
export function ThreadComposer({ inputRef, otherHandle, replyingTo, replyHandle, onCancelReply, replyNote, send, ready }: ThreadComposerProps) {
  const t = useTranslations('messages');
  const toast = useToast();
  const [text, setText] = useState('');
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [picture, setPicture] = useState<PendingPicture | null>(null);
  // A picture being made ready (scaled on the device): sending waits for it.
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // The chip's own copy of the picture goes when it does.
  useEffect(() => () => {
    if (picture) URL.revokeObjectURL(picture.previewUrl);
  }, [picture]);

  /** Attach `file` in place of a card or a picture before it; one the browser can't read is said so, and nothing changes. */
  async function attachPicture(file: File) {
    setPreparing(true);
    try {
      const ready = await preparePicture(file);
      setPendingCard(null);
      setPicture({ ...ready, previewUrl: URL.createObjectURL(ready.file) });
      inputRef.current?.focus();
    } catch (e) {
      if (!(e instanceof UnsupportedImage)) console.error('Picture not prepared:', e);
      toast.show({ message: t('imageUnsupported') });
    } finally {
      setPreparing(false);
    }
  }
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardModalLoaded = useOpenedOnce(cardModalOpen);
  // The note-reply quote rides the next message; dismissable if reconsidered.
  const [noteRef, setNoteRef] = useState(replyNote);
  useEffect(() => setNoteRef(replyNote), [replyNote?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow: the field rests at one line and takes its height from what is written (the CSS caps it).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, inputRef]);

  const trimmed = text.trim();
  const valid = ready && !preparing && (trimmed.length > 0 || !!pendingCard || !!picture) && trimmed.length <= MESSAGE_MAX_LENGTH;

  function submit() {
    if (!valid) return;
    const image = picture ? { file: picture.file, width: picture.width, height: picture.height } : undefined;
    if (!send({ text: trimmed, cardRef: pendingCard?.id, noteRef, image })) return;
    setText('');
    setPendingCard(null);
    setPicture(null);
    setNoteRef(undefined);
    inputRef.current?.focus();
  }

  // The capsule's pen darkens while it is written in.
  const [focused, setFocused] = useState(false);
  const carries = !!(replyingTo || noteRef || pendingCard || picture);

  return (
    <>
      {/* What rides the next message — the message it answers, then a note, a card or a picture — as rows in the
          reply's style straight on the foot's paper, over the capsule, which keeps its exact shape whatever it
          carries (round 10 §3.4). */}
      {carries && (
        <div className={styles.carry}>
          {replyingTo && (
            <CarryRow
              lead={
                <span className={styles.carryRule} aria-hidden>
                  <Divider orientation="vertical" seed={31} amplitude={1.1} strokeWidth={INK} color="var(--color-terracotta)" spacing={0} />
                </span>
              }
              label={replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf')}
              detail={replyingTo.text || t('replyCard')}
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
              label={t('attachCardShort')}
              detail={pendingCard.thoughtCore}
              removeLabel={t('removeCard')}
              onRemove={() => setPendingCard(null)}
            />
          )}
          {picture && (
            <CarryRow
              lead={<CarryTile picture={picture.previewUrl} />}
              label={t('attachImage')}
              removeLabel={t('removeImage')}
              onRemove={() => setPicture(null)}
            />
          )}
        </div>
      )}

      <ComposerCapsule focused={focused} ready={valid} sendLabel={t('send')} onSend={submit}>
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
          className={styles.fileInput}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void attachPicture(file);
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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={(e) => {
              // A picture pasted is attached, as one picked is; words paste as words.
              const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
              if (!file) return;
              e.preventDefault();
              void attachPicture(file);
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
      </ComposerCapsule>

      {cardModalLoaded && (
        <InsertCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          title={t('pickCard')}
          subtitle={t('pickCardSubtitle')}
          onPick={(card) => {
            // One of the two: a card in place of a picture.
            setPicture(null);
            setPendingCard(card);
            setCardModalOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * One thing riding the next message, in the reply's style (round 10 §3.4): what it is at the start — the reply's
 * wavy rule, a picture's thumbnail, a card's cover or a glyph on a tonal tile — then whom or what (and a line of
 * it), and its ✕ at the end.
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

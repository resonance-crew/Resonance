'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CharCount, Textarea } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { ComposerCapsule } from '@/components/sections/MessagesPage/ComposerCapsule';
import { useToast } from '@/components/providers/ToastProvider';
import { useRouter } from '@/i18n/navigation';
import { newClientId } from '@/lib/chat/outbox';
import { forgetNoteDraft, keepNoteDraft, readNoteDraft } from '@/lib/data/noteDrafts';
import { leaveWriteSeed } from '@/lib/data/writeSeed';
import { ApiError } from '@/lib/db/firestore/client/api';
import { NOTE_MAX_LENGTH, sendNote } from '@/lib/db/firestore/client/notes';
import { useHint } from '@/lib/hints';
import styles from './NoteInPlace.module.css';

/** Past this length the quiet「這段話想寫成一張卡片嗎？」line takes the line under the field. */
export const NOTE_UPGRADE_THRESHOLD = 200;
/** From this length the count shows at the line's end (the limit is NOTE_MAX_LENGTH). */
export const NOTE_COUNT_FROM = 1800;
/** The query a failed note's 再寄一次 opens the card with: the field open and focused. */
export const NOTE_QUERY = 'note';

export type NoteMode = 'closed' | 'field' | 'wait';

export interface NoteInPlaceState {
  mode: NoteMode;
  text: string;
  error: string | null;
  /** Changes when the field should take the focus (opened by its segment, a failed send put back). */
  focusNonce: number;
  /** The segment (寄小紙條): open and focus; again, an empty field closes, one with words takes the focus back. */
  toggle: () => void;
  /** Escape in the field: an empty one closes (the focus back on the segment), one with words only lets go of it. */
  escape: () => 'closed' | 'blurred';
  setText: (text: string) => void;
  send: () => void;
  /** Over 200: the words go to the writer as a card of their own, and the field closes. */
  upgrade: () => void;
}

/**
 * The note written in place (round 26, SETTLED「The note, in place」): what 寄小紙條 opens under the end row — never a
 * dialog over the story (the owner: 「這個記小紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」). Its
 * words are the note composer's draft for this card (lib/data/noteDrafts) as they are typed, so nothing is ever
 * thrown away: a draft not yet sent opens the field with the page. Sent at once (round 21): the field clears and
 * closes, the toast says so, and the words stay kept until the server has them — a refusal while the page is still
 * here puts them back in the field and says why; once the page is gone, a toast offers 再寄一次, which opens the
 * card again with the field open (the draft is still there). While three of the reader's notes wait for the
 * author's answer (`mayNote` false), the segment opens the one line saying so instead, and the draft stays.
 */
export function useNoteInPlace({ cardId, uid, mayNote }: { cardId: string; uid: string | undefined; mayNote: boolean }): NoteInPlaceState {
  const t = useTranslations('card.note');
  const tCard = useTranslations('card');
  const tMessages = useTranslations('messages');
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<NoteMode>('closed');
  const [text, setTextState] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  // Whether this page is still here when the server answers.
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  // The send in flight or failed: its words and clientId (the same words sent again are a retry).
  const attempt = useRef<{ text: string; clientId: string } | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const mayRef = useRef(mayNote);
  mayRef.current = mayNote;

  // A draft not yet sent opens the field with the page; so does a failed note's 再寄一次 (?note), focused.
  useEffect(() => {
    if (!uid) return;
    const draft = readNoteDraft(uid, cardId);
    const asked = new URLSearchParams(window.location.search).has(NOTE_QUERY);
    if (draft) setTextState(draft);
    if (draft || asked) setMode(mayRef.current || !!draft ? 'field' : 'wait');
    if (asked) setFocusNonce((n) => n + 1);
  }, [uid, cardId]);

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      setError(null);
      if (uid) keepNoteDraft(uid, cardId, next);
    },
    [uid, cardId],
  );

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const toggle = useCallback(() => {
    const m = modeRef.current;
    const words = !!textRef.current.trim();
    if (m === 'closed') {
      if (!mayRef.current && !words) {
        setMode('wait');
        return;
      }
      setMode('field');
      setFocusNonce((n) => n + 1);
    } else if (m === 'wait' || !words) {
      setMode('closed');
    } else {
      setFocusNonce((n) => n + 1);
    }
  }, []);

  const escape = useCallback((): 'closed' | 'blurred' => {
    if (textRef.current.trim()) return 'blurred';
    setMode('closed');
    return 'closed';
  }, []);

  const send = useCallback(() => {
    const trimmed = textRef.current.trim();
    if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) return;
    if (attempt.current?.text !== trimmed) attempt.current = { text: trimmed, clientId: newClientId() };
    const { clientId } = attempt.current;
    // Sent at once: cleared and closed, the toast saying so; the draft stays until the server has the words.
    setTextState('');
    setError(null);
    setMode('closed');
    toast.show({ message: t('sent') });
    sendNote({ cardId, text: trimmed, clientId }).then(
      () => {
        attempt.current = null;
        // What was sent leaves the device — not words typed since.
        if (uid && readNoteDraft(uid, cardId)?.trim() === trimmed) forgetNoteDraft(uid, cardId);
      },
      (err) => {
        // No pen name yet (the server asks before anything else): the words wait on the device while one is chosen.
        if (err instanceof ApiError && err.status === 403 && err.code === 'forbidden') {
          if (here.current && !textRef.current.trim()) setTextState(trimmed);
          toast.dismiss();
          router.push('/signup');
          return;
        }
        const conflict = err instanceof ApiError && err.code === 'conflict';
        const why = conflict
          ? t('waitForReply')
          : err instanceof ApiError && err.status === 404
            ? tCard('notFound.title')
            : tMessages('sendError');
        if (here.current) {
          // Back into the field, the line saying why (words typed since win over them).
          if (!textRef.current.trim()) setTextState(trimmed);
          setError(why);
          setMode('field');
          setFocusNonce((n) => n + 1);
          toast.dismiss();
        } else {
          toast.show({
            message: conflict ? why : t('failed'),
            action: conflict
              ? undefined
              : { label: t('reopen'), ariaLabel: `${t('failed')} · ${t('reopen')}`, icon: 'note', onAction: () => router.push(`/card/${cardId}?${NOTE_QUERY}=1`) },
          });
        }
      },
    );
  }, [cardId, uid, toast, router, t, tCard, tMessages]);

  const upgrade = useCallback(() => {
    const words = textRef.current;
    // Carried into a card of its own: the writer keeps the words from here (through this tab, never the address).
    if (uid) forgetNoteDraft(uid, cardId);
    leaveWriteSeed(cardId, words);
    setTextState('');
    setMode('closed');
    router.push(`/write?referenceCardId=${cardId}`);
  }, [uid, cardId, router]);

  return { mode, text, error, focusNonce, toggle, escape, setText, send, upgrade };
}

export interface NoteInPlaceProps {
  /** The block's id: the segment's `aria-controls`. */
  id: string;
  note: NoteInPlaceState;
  /** The viewer resonated: the field asks 哪一段讓你有共鳴？ (else the note's own placeholder). */
  asking: boolean;
  /** Escape closed the empty field: the focus goes back to the segment. */
  onClosedByKey?: () => void;
}

/**
 * The note's place under the end row: the composer's input capsule (messages-ui) — the envelope's column, the
 * text, the send segment (tonal at rest, solid with words) — one line 48 tall growing to three on a phone (two in a
 * short window), five wider, then scrolling inside; and one line under it, one message at a time: why a send was
 * refused > 「這段話想寫成一張卡片嗎？」 past 200 > 「這段話只有作者看得到」 (its first three showings). The count at
 * the line's end from 1,800. Or, while the reader's notes wait for the author, that one line instead.
 */
export function NoteInPlace({ id, note, asking, onClosedByKey }: NoteInPlaceProps) {
  const t = useTranslations('card.note');
  const tTap = useTranslations('card.tap');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [lines, setLines] = useState(1);
  const trimmed = note.text.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH;

  useEffect(() => {
    if (!note.focusNonce || note.mode !== 'field') return;
    inputRef.current?.focus({ preventScroll: true });
    // The page scrolls the field's block into view, 12 over a phone's keyboard once it is up (nothing floats).
    const lift = () => {
      const block = blockRef.current;
      const vv = window.visualViewport;
      if (!block) return;
      const r = block.getBoundingClientRect();
      const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      if (r.bottom > bottom - 12) window.scrollBy({ top: r.bottom - bottom + 12, behavior: 'smooth' });
      else if (r.top < 0) block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    lift();
    const timer = window.setTimeout(lift, 350);
    return () => window.clearTimeout(timer);
  }, [note.focusNonce, note.mode]);

  // One line in 48, growing with what is written (the CSS caps it), its lines counted for the send block.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 24;
    const room = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    setLines(Math.max(1, Math.round((el.scrollHeight - room) / line)));
  }, [note.text, note.mode]);

  if (note.mode === 'closed') return null;

  if (note.mode === 'wait') {
    return (
      <div id={id} ref={blockRef} className={styles.block} data-mode="wait">
        <p className={styles.wait}>{t('waitForReply')}</p>
      </div>
    );
  }

  return (
    <div id={id} ref={blockRef} className={styles.block} data-mode="field">
      <ComposerCapsule focused={focused} ready={valid} sendLabel={t('send')} onSend={note.send} block={lines > 1}>
        <span className={styles.glyph} aria-hidden>
          <Icon name="note" size={18} color="var(--color-text-muted)" />
        </span>
        <div className={styles.field}>
          <Textarea
            ref={inputRef}
            variant="subtle"
            className={styles.input}
            value={note.text}
            onChange={(e) => note.setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (note.escape() === 'closed') onClosedByKey?.();
              else inputRef.current?.blur();
            }}
            placeholder={asking ? tTap('ask') : t('placeholder')}
            aria-label={t('entry')}
            aria-describedby={`${id}-line`}
            rows={1}
            maxLength={NOTE_MAX_LENGTH}
            data-note-field=""
          />
        </div>
      </ComposerCapsule>
      <NoteLine id={`${id}-line`} note={note} length={trimmed.length} />
    </div>
  );
}

/** The one line under the field: the error > the card prompt > the privacy line; the count at its end from 1,800. */
function NoteLine({ id, note, length }: { id: string; note: NoteInPlaceState; length: number }) {
  const t = useTranslations('card.note');
  const privacy = useHint('note-privacy');
  const count = length >= NOTE_COUNT_FROM ? <CharCount count={length} max={NOTE_MAX_LENGTH} /> : null;
  const message = note.error ? (
    <span role="alert" className={styles.error}>
      {note.error}
    </span>
  ) : length > NOTE_UPGRADE_THRESHOLD ? (
    <button type="button" className={styles.upgrade} onClick={note.upgrade}>
      {t('upgrade')}
    </button>
  ) : privacy.visible ? (
    <span className={styles.hint}>{t('hint')}</span>
  ) : null;
  if (!message && !count) return <div id={id} className={styles.line} data-empty="" />;
  return (
    <div id={id} className={styles.line}>
      <span className={styles.lineMessage}>{message}</span>
      {count}
    </div>
  );
}

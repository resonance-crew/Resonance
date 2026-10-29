'use client';

import { useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { RowWash } from '../MessagesPage/RowWash';
import { wobRect } from '@/lib/design/wobRect';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { cardVar, previewPalette } from '@/lib/design/cardColours';
import { seedFromString } from '@/lib/design/prng';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { Card, Notification, User } from '@/lib/db/types';
import styles from './NotificationBell.module.css';

/** Stands in for the pen name while the sentence is formatted, so the name can be set apart wherever it falls. */
const NAME = '⁣';

const KEYS: Partial<Record<Notification['type'], string>> = {
  invite: 'invite',
  invite_accepted: 'inviteAccepted',
  message: 'message',
  resonance: 'resonance',
  note: 'note',
  card_link: 'cardLink',
};

/** A row with nobody behind it says what happened beside a glyph. */
const GLYPHS: Partial<Record<Notification['type'], IconName>> = {
  resonance_summary: 'sparkle',
  translation_done: 'globe',
  invite_expired: 'users',
};

/**
 * The row's sentence, its pen name apart: `{ before, handle, after }` — the
 * name bold, the words around it as the language puts them (「{handle} 寄來一張
 * 小紙條」, "{handle} sent you a little note"). A row with nobody behind it
 * (a summary, a translation, an expired invite) is all `before`.
 */
export function bellSentence(
  t: ReturnType<typeof useTranslations<'app.notifications'>>,
  n: Pick<Notification, 'type' | 'payload'>,
): { before: string; handle: string | null; after: string } {
  const key = KEYS[n.type];
  if (key) {
    const [before = '', after = ''] = t(key as 'note', { handle: NAME }).split(NAME);
    return { before, handle: String(n.payload.fromHandle ?? ''), after };
  }
  const whole =
    n.type === 'resonance_summary'
      ? t('resonanceSummary', { count: Number(n.payload.count ?? 0) })
      : n.type === 'translation_done'
        ? t('translationDone')
        : n.type === 'invite_expired'
          ? t('inviteExpired')
          : '';
  return { before: whole, handle: null, after: '' };
}

export interface BellRowProps {
  n: Notification;
  /** Who it is from, once read (undefined while reading, or for an account that is gone). */
  person: User | undefined;
  /** The card it is about, once read. */
  card: Card | undefined;
  /** The extras are in: a card still missing now is one the viewer can't read any more. */
  settled: boolean;
  when: string;
}

/**
 * One notification (round 21): who did it — their face — on the left; their
 * pen name in bold and what they did, a note's own words quoted under it in
 * its card's colour, and when; the card it is about on the right (its cover,
 * no frame, as a feed card's picture; or its colours and first word). Unread:
 * the words in the text's ink and the dot ending the first line; read, all
 * muted. Rows stand apart by air alone, a wash under the pointer (the
 * conversation list's rows).
 */
export function BellRowContent({ n, person, card, settled, when }: BellRowProps) {
  const t = useTranslations('app.notifications');
  const unread = n.readAt === null;
  const { before, handle, after } = bellSentence(t, n);
  const cardId = typeof n.payload.cardId === 'string' ? n.payload.cardId : '';
  const preview = n.type === 'note' && typeof n.payload.preview === 'string' ? n.payload.preview : '';
  const fromId = typeof n.payload.fromUserId === 'string' ? n.payload.fromUserId : '';
  return (
    <span className={styles.row}>
      <RowWash seed={seedFromString(n.id) % 97} />
      {handle != null ? (
        <BellFace person={person} handle={handle} uid={fromId} settled={settled} />
      ) : (
        <span className={styles.glyphTile} aria-hidden>
          <Icon name={GLYPHS[n.type] ?? 'bell'} size={18} color="var(--color-terracotta)" />
        </span>
      )}
      <span className={styles.words} data-unread={unread || undefined}>
        <span className={styles.line}>
          {before}
          {handle != null && <b className={styles.handle}>{handle}</b>}
          {after}
          {unread && <span aria-hidden data-unread-dot className={styles.dot} />}
          {unread && <span className={styles.srOnly}>{`, ${t('unread')}`}</span>}
        </span>
        {/* A note's content IS the notification: the reader wrote to the author, so its words are here. */}
        {preview && <BellNoteQuote text={preview} card={card} />}
        <span className={styles.when}>{when}</span>
      </span>
      {cardId && (card ? <BellCardThumb card={card} /> : !settled && <span className={styles.thumbPending} aria-hidden />)}
    </span>
  );
}

/** Their face: the photo, else initials on their colour; a quiet tile while they are read. */
function BellFace({ person, handle, uid, settled }: { person: User | undefined; handle: string; uid: string; settled: boolean }) {
  if (!person && !settled) return <span className={styles.facePending} aria-hidden />;
  return (
    <HandDrawnAvatar
      src={person?.avatarUrl}
      initials={person?.initials ?? (Array.from(handle).slice(0, 2).join('').toUpperCase() || '?')}
      color={person?.accentColor}
      size={40}
      seed={Number(person?.avatarSeed) || (seedFromString(uid || handle) % 50) + 1}
    />
  );
}

const THUMB = 46;

/**
 * The card a row is about, at 46: its cover clipped to a small wobbly square with no pen line (a feed
 * card's picture has none either), else its own colours with the first character of its title.
 */
export function BellCardThumb({ card }: { card: Card }) {
  const family = previewPalette(card.accentHue ?? null, card.id);
  const seed = seedFromString(card.id) % 97;
  const clip = useMemo(
    () => `path('${wobRect(THUMB, THUMB, THUMB * 0.24, seed, 1.1, { segmentsH: 1, segmentsV: 1, curve: 1.2, cornerJitter: 1.2 })}')`,
    [seed],
  );
  const cover = card.media?.type === 'image' ? card.media.url : undefined;
  return (
    <span className={styles.thumb} style={{ clipPath: clip, background: cardVar(cover ? 'skeleton' : 'fill', family) }} aria-hidden>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className={styles.thumbWord} style={{ color: cardVar('border-deep', family) }}>
          {Array.from(card.thoughtCore.trim())[0] ?? ''}
        </span>
      )}
    </span>
  );
}

/** A note's words as the bell quotes them: the story's type, after a wavy rule in its card's pen. */
function BellNoteQuote({ text, card }: { text: string; card: Card | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { h } = useElementSize(ref);
  const pen = card ? cardVar('border', previewPalette(card.accentHue ?? null, card.id)) : 'var(--sheet-pen)';
  return (
    <span ref={ref} className={styles.quote}>
      {h > 0 && (
        <svg className={styles.quoteRule} width={6} height={h} aria-hidden>
          <path
            d={wavyVertical(h, 7, 1.4, Math.max(2, Math.round(h / 20)))}
            transform="translate(3 0)"
            fill="none"
            stroke={pen}
            strokeWidth={INK}
            strokeLinecap="round"
          />
        </svg>
      )}
      {text}
    </span>
  );
}

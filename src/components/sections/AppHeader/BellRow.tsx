'use client';

import { Fragment, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { BandWash, bandHost, useBandPress } from '@/components/atoms/BandWash/BandWash';
import { wobRect } from '@/lib/design/wobRect';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { cardVar, previewPalette } from '@/lib/design/cardColours';
import { seedFromString } from '@/lib/design/prng';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { Card, Notification, User } from '@/lib/db/types';
import { coverThumbUrl } from '@/lib/adapters/story';
import { RevealImg } from '@/components/atoms/RevealImg/RevealImg';
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
  read_summary: 'sparkle',
  translation_done: 'globe',
  invite_expired: 'users',
};

/**
 * Who a row is from: `fromUserId`, or — a resonance tap's row (round 26), which names everyone who tapped that
 * day, newest first — the first of its `fromUserIds`.
 */
export function bellFrom(n: Pick<Notification, 'type' | 'payload'>): string {
  if (typeof n.payload.fromUserId === 'string') return n.payload.fromUserId;
  const ids = n.type === 'resonance_tap' && Array.isArray(n.payload.fromUserIds) ? n.payload.fromUserIds : [];
  return typeof ids[0] === 'string' ? ids[0] : '';
}

/**
 * The row's sentence, its pen name apart: `{ before, handle, after }` — the
 * name bold, the words around it as the language puts them (「{handle} 寄來一張
 * 小紙條」, "{handle} sent you a little note"). A row with nobody behind it
 * (a summary, a translation, an expired invite) is all `before`.
 */
export function bellSentence(
  t: ReturnType<typeof useTranslations<'app.notifications'>>,
  n: Pick<Notification, 'type' | 'payload'>,
  /** The pen name of whoever it is from, once read — a tap's row carries ids only. */
  personHandle?: string,
): { before: string; handle: string | null; after: string } {
  const key = KEYS[n.type];
  if (key) {
    const [before = '', after = ''] = t(key as 'note', { handle: NAME }).split(NAME);
    return { before, handle: String(n.payload.fromHandle ?? ''), after };
  }
  if (n.type === 'resonance_tap') {
    // 「{handle} 與你的卡片共振了」, or 「{handle} 和另外 {count} 人…」 for everyone else who tapped that day.
    const ids = Array.isArray(n.payload.fromUserIds) ? n.payload.fromUserIds.filter((v) => typeof v === 'string') : [];
    const others = Math.max(0, ids.length - 1);
    const line = others > 0 ? t('tapMany', { handle: NAME, count: others }) : t('tap', { handle: NAME });
    const [before = '', after = ''] = line.split(NAME);
    return { before, handle: personHandle ?? '', after };
  }
  const whole =
    n.type === 'resonance_summary'
      ? t('resonanceSummary', { count: Number(n.payload.count ?? 0) })
      : n.type === 'read_summary'
        ? t(n.payload.reread === true ? 'readSummaryReread' : 'readSummary', { count: Number(n.payload.readers ?? 0) })
        : n.type === 'translation_done'
          ? t('translationDone')
          : n.type === 'invite_expired'
            ? t('inviteExpired')
            : '';
  return { before: whole, handle: null, after: '' };
}

export interface BellRowProps {
  n: Notification;
  /** The keys of the band's curves (lib/design/listBands): its own along the top, the one under it along the bottom. */
  band: { top: string; bottom: string };
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
 * muted. Each row is a band (round 23 §4): the list's whole width between
 * two hand-drawn curves it shares with its neighbours, washed only under a
 * pointer or a press — its content in the list's column.
 */
export function BellRowContent({ n, band, person, card, settled, when }: BellRowProps) {
  const t = useTranslations('app.notifications');
  const unread = n.readAt === null;
  const { before, handle, after } = bellSentence(t, n, person?.handle);
  const cardId = typeof n.payload.cardId === 'string' ? n.payload.cardId : '';
  const preview = n.type === 'note' && typeof n.payload.preview === 'string' ? n.payload.preview : '';
  const fromId = bellFrom(n);
  const press = useBandPress();
  return (
    <span className={`${styles.row} ${bandHost}`} {...press}>
      <BandWash topKey={band.top} bottomKey={band.bottom} />
      <span className={styles.rowInner}>
        {handle != null ? (
          <BellFace person={person} handle={handle} uid={fromId} settled={settled} />
        ) : (
          <span className={styles.glyphTile} aria-hidden>
            <Icon name={GLYPHS[n.type] ?? 'bell'} size={18} color="var(--color-terracotta)" />
          </span>
        )}
        <span className={styles.words} data-unread={unread || undefined}>
          <span className={styles.line}>
            <BellLine before={before} handle={handle} after={after} dot={unread} />
            {unread && <span className={styles.srOnly}>{`, ${t('unread')}`}</span>}
          </span>
          {/* A note's content IS the notification: the reader wrote to the author, so its words are here. */}
          {preview && <BellNoteQuote text={preview} card={card} />}
          <span className={styles.when}>{when}</span>
        </span>
        {cardId && (card ? <BellCardThumb card={card} /> : !settled && <BellThumbPending cardId={cardId} />)}
      </span>
    </span>
  );
}

/** `text` without its last character (a grapheme: a letter with its marks, an emoji), and that character. */
export function splitLastGrapheme(text: string): [string, string] {
  const s = text.trimEnd();
  let last = '';
  if (typeof Intl.Segmenter === 'function') {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) last = segment;
  } else {
    const chars = Array.from(s);
    last = chars[chars.length - 1] ?? '';
  }
  return [s.slice(0, s.length - last.length), last];
}

/**
 * The sentence, the pen name in bold — and, unread, the dot after it, held to the sentence's last character
 * (round 26): a lone inline-block may break onto a line of its own when the words fill the column exactly
 * ("bob replied to your story with a card" at 390), and the row grew a line for a dot. In a span that never
 * wraps with that character, the dot goes down with it; a word stays whole since nothing breaks inside one,
 * and Chinese, which may break between any two characters, keeps the last of them with the dot.
 */
function BellLine({ before, handle, after, dot }: { before: string; handle: string | null; after: string; dot: boolean }) {
  const parts: { text: string; bold: boolean }[] = [
    { text: before, bold: false },
    ...(handle != null ? [{ text: handle, bold: true }] : []),
    { text: after, bold: false },
  ];
  let last = -1;
  if (dot) for (let i = 0; i < parts.length; i++) if (parts[i].text.trim() !== '') last = i;
  const mark = <span aria-hidden data-unread-dot className={styles.dot} />;
  return (
    <>
      {parts.map((p, i) => {
        if (last >= 0 && i > last) return null; // nothing after the last word but spaces
        const [head, tail] = i === last ? splitLastGrapheme(p.text) : [p.text, ''];
        const held = i === last && (
          <span className={styles.held}>
            {tail}
            {mark}
          </span>
        );
        return p.bold ? (
          <b key={i} className={styles.handle}>
            {head}
            {held}
          </b>
        ) : (
          <Fragment key={i}>
            {head}
            {held}
          </Fragment>
        );
      })}
      {dot && last < 0 && mark}
    </>
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
/** How far the thumb's face reaches past its box: the outline's edges swell out by up to 2.1. */
const THUMB_BLEED = 4;

/**
 * The thumb's outline: a small hand-drawn tile, one gentle swell along each side and its corners
 * unevenly round and set off a little (an avatar's), so it reads as a cut-out picture rather than
 * an app icon. No pen line. The apps' twins (`BellThumb`) take the same numbers.
 */
function bellThumbPath(seed: number): string {
  return wobRect(THUMB, THUMB, THUMB * 0.26, seed, THUMB * 0.05, {
    segmentsH: 2,
    segmentsV: 2,
    curve: 1.4,
    cornerJitter: 2.6,
    cornerOffset: THUMB * 0.07,
  });
}

function useThumbClip(id: string) {
  const seed = seedFromString(id) % 97;
  return useMemo(() => `path('${bellThumbPath(seed)}')`, [seed]);
}

/**
 * The card a row is about, at 46: its cover clipped to a small hand-drawn tile with no pen line (a feed
 * card's picture has none either), else its own colours with the first character of its title. The face
 * reaches past the box by `THUMB_BLEED`, so the outline's outward swells land on the picture.
 */
export function BellCardThumb({ card }: { card: Card }) {
  const family = previewPalette(card.accentHue ?? null, card.id);
  const clip = useThumbClip(card.id);
  // The ≤ 960 px list copy when the cover has one: a 46 tile never needs the 2048 px cover.
  const cover = card.media?.type === 'image' ? (coverThumbUrl(card) ?? card.media.url) : undefined;
  return (
    <span className={styles.thumb} style={{ clipPath: clip }} aria-hidden>
      <span className={styles.thumbFace} style={{ inset: -THUMB_BLEED, background: cardVar(cover ? 'skeleton' : 'fill', family) }}>
        {cover ? (
          <RevealImg reveal="thumb" src={cover} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.thumbWord} style={{ color: cardVar('border-deep', family) }}>
            {Array.from(card.thoughtCore.trim())[0] ?? ''}
          </span>
        )}
      </span>
    </span>
  );
}

/** A quiet tile in the same outline while the card is read, so nothing changes shape when it lands. */
function BellThumbPending({ cardId }: { cardId: string }) {
  const clip = useThumbClip(cardId);
  return (
    <span className={styles.thumbPending} style={{ clipPath: clip }} aria-hidden>
      <span className={styles.thumbFace} style={{ inset: -THUMB_BLEED }} />
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

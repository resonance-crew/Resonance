'use client';

import { useTranslations } from 'next-intl';
import { BandWash, bandHost, useBandPress } from '@/components/atoms/BandWash/BandWash';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { Link } from '@/i18n/navigation';
import type { TapPersonBody } from '@/lib/api/v1/schemas';
import { BAND_END_KEY, bandsBelow } from '@/lib/design/listBands';
import styles from './TapPeople.module.css';

/** Where a person's row in a tap list leads: their note's conversation (the author's list, a named card), else their page. */
export function tapPersonHref(p: TapPersonBody): string {
  const handle = encodeURIComponent(p.author.handle);
  return p.note ? `/messages/${handle}?u=${encodeURIComponent(p.author.id)}` : `/u/${handle}`;
}

/** A row's face: 36, in the reader's dialog and the author's alike (a row 60 tall, a note's line under the name in the author's). */
export const TAP_PERSON_FACE = 36;

/**
 * The reader's own row in their list (round 27 §U3): whose it is, the quote of their pick as the card page holds it
 * (undefined: as the list answers it), whether the card offers passages (then, with no pick, 選一段), and what a
 * press on it does then (closes the list and opens the passages' dialog). No other row of a reader's list ever
 * quotes anyone.
 */
export interface TapOwnRow {
  id: string;
  quote?: string | null;
  offer: boolean;
  onPress?: () => void;
}

export interface TapPeopleProps {
  people: TapPersonBody[];
  /** A reader's list: their own row (§U3). Left out: the author's list, where every row quotes its pick (§U2). */
  own?: TapOwnRow;
  /** A row was opened (its dialog closes). */
  onPick?: () => void;
  /** The key the last band ends on (a "show more" under it, or the list's end). */
  endKey?: string;
  /**
   * The author's list quotes each person's pick under their name (round 27 §U2); false for one sentence's people
   * (round 29 §S4.2: the sentence heads the dialog, so no row says it again).
   */
  quotes?: boolean;
}

/**
 * Who resonated (round 26 §U2.5, §U3.2): one band per person — the list's width between hand-drawn curves seen only
 * under a pointer or a press, as the bell's rows — their face and pen name, and, in the author's list, the first line
 * of the note they left on the card, muted, under the name. A row opens that note's conversation, or else their page:
 * a tap alone gives no way to write to anyone.
 */
export function TapPeople({ people, own, onPick, endKey = BAND_END_KEY, quotes = true }: TapPeopleProps) {
  const below = bandsBelow(people.map((p) => p.author.id), endKey);
  return (
    <ul className={styles.list}>
      {people.map((p, i) => (
        <li key={p.author.id}>
          <PersonRow
            person={p}
            band={{ top: p.author.id, bottom: below[i] }}
            onPick={onPick}
            own={own ? (p.author.id === own.id ? own : null) : undefined}
            quotes={quotes}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * A row's second line, round 27: every list quotes each person's pick (§U2; a reader's too since Wave 2 #3b), and a
 * reader's own row says their pick, or 選一段 when the card has passages and they picked none (§U3). Null: no such line.
 */
function rowQuote(person: TapPersonBody, own: TapOwnRow | null | undefined, quotes = true): { quote: string } | { pick: true } | null {
  if (!own) return quotes && person.passage?.text ? { quote: person.passage.text } : null;
  const text = own.quote === undefined ? person.passage?.text : own.quote;
  if (text) return { quote: text };
  return own.offer ? { pick: true } : null;
}

function PersonRow({
  person,
  band,
  onPick,
  own,
  quotes,
}: {
  person: TapPersonBody;
  band: { top: string; bottom: string };
  onPick?: () => void;
  quotes?: boolean;
  /** Undefined in the author's list; in a reader's, their own row's (§U3) or null on everyone else's. */
  own?: TapOwnRow | null;
}) {
  const t = useTranslations('card.tap');
  const press = useBandPress();
  const a = person.author;
  const second = rowQuote(person, own, quotes);
  const inner = (
    <>
      <BandWash topKey={band.top} bottomKey={band.bottom} />
      <span className={styles.rowInner}>
        <HandDrawnAvatar
          src={a.avatarUrl ?? undefined}
          initials={a.initials}
          size={TAP_PERSON_FACE}
          color={a.accentColor}
          seed={Number(a.avatarSeed) || 1}
        />
        <span className={styles.words}>
          <span className={styles.handle}>{a.handle}</span>
          {second && 'quote' in second && (
            <span className={styles.quote} data-tap-quote="">
              {t('passageQuote', { text: second.quote })}
            </span>
          )}
          {second && 'pick' in second && (
            <span className={styles.pick} data-tap-pick="">
              {t('passagePick')}
            </span>
          )}
          {person.note && <span className={styles.note}>{person.note.excerpt}</span>}
        </span>
      </span>
    </>
  );
  // The reader's own row, on a card with passages: it reopens the dialog with their pick marked (§U3).
  if (own?.onPress) {
    const go = own.onPress;
    return (
      <button
        type="button"
        className={`${styles.row} ${styles.button} ${bandHost}`}
        data-tap-own=""
        aria-haspopup="dialog"
        onClick={() => {
          onPick?.();
          go();
        }}
        {...press}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={tapPersonHref(person)} className={`${styles.row} ${bandHost}`} onClick={onPick} {...press}>
      {inner}
    </Link>
  );
}

/**
 * The list's rows on their way: a face and a name's line each, touching as the bands do — exactly as many as will
 * come (round 33 §Q1: the faces already on the page, `tapRowsKnown`; never a default count).
 */
export function TapPeopleSkeleton({ rows }: { rows: number }) {
  const t = useTranslations('home');
  const face = TAP_PERSON_FACE;
  return (
    <ul className={styles.list} role="status" aria-label={t('moreLoading')}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} aria-hidden>
          <span className={styles.row}>
            <span className={styles.rowInner}>
              <Skeleton width={face} height={face} radius={face * 0.35} />
              <Skeleton width={`${[48, 36, 56][i % 3]}%`} height={14} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

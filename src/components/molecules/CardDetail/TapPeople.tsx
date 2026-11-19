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

export interface TapPeopleProps {
  people: TapPersonBody[];
  /** A row was opened (its dialog closes). */
  onPick?: () => void;
  /** The key the last band ends on (a "show more" under it, or the list's end). */
  endKey?: string;
}

/**
 * Who resonated (round 26 §U2.5, §U3.2): one band per person — the list's width between hand-drawn curves seen only
 * under a pointer or a press, as the bell's rows — their face and pen name, and, in the author's list, the first line
 * of the note they left on the card, muted, under the name. A row opens that note's conversation, or else their page:
 * a tap alone gives no way to write to anyone.
 */
export function TapPeople({ people, onPick, endKey = BAND_END_KEY }: TapPeopleProps) {
  const below = bandsBelow(people.map((p) => p.author.id), endKey);
  return (
    <ul className={styles.list}>
      {people.map((p, i) => (
        <li key={p.author.id}>
          <PersonRow person={p} band={{ top: p.author.id, bottom: below[i] }} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function PersonRow({ person, band, onPick }: { person: TapPersonBody; band: { top: string; bottom: string }; onPick?: () => void }) {
  const press = useBandPress();
  const a = person.author;
  return (
    <Link href={tapPersonHref(person)} className={`${styles.row} ${bandHost}`} onClick={onPick} {...press}>
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
          {person.note && <span className={styles.note}>{person.note.excerpt}</span>}
        </span>
      </span>
    </Link>
  );
}

/** The list's rows on their way: a face and a name's line each, touching as the bands do. */
export function TapPeopleSkeleton({ rows = 3 }: { rows?: number }) {
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

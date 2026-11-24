'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import useSWRInfinite from 'swr/infinite';
import { AvatarGroup } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import type { CardTapBody, TapListBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { facesNames, memberOf } from './TapFaces';
import { TAP_DIALOG_PADDING, tapRowsKnown, useTapListHold } from './tapList';
import { TapPeople, TapPeopleSkeleton } from './TapPeople';
import styles from './AuthorTaps.module.css';

export interface AuthorTapsProps {
  cardId: string;
  /** `CardDetail.tap` as the card's author reads it: the three newest who resonated, and whether there are more. */
  tap: CardTapBody | null | undefined;
  /** What ends the line: the card's share and ⋯ after a long story at ≥ 1200 (else they stand alone, CardDetailClient). */
  trailing?: ReactNode;
}

/**
 * What the author sees where a reader's end row would be (round 26 §U3): one line — the `wave` glyph, muted, then
 * the faces of the three newest who resonated, and nothing after them when there are more (no blank disc, round 29
 * §S5: the dialog says who else). Nothing at all when no
 * one has (no 「還沒有人共振」), and no number anywhere. Tapping it opens who they are in a centred dialog on every
 * device: 30 at a time then 顯示更多, each a face and a pen name, and — when they left a note on this card — its first
 * line, muted, opening that conversation (an unconnected reader's is the letter; replying connects, as ever). Someone
 * who only resonated can't be written to: their row opens their page. On an anonymous card, faces and names only.
 */
export function AuthorTaps({ cardId, tap, trailing }: AuthorTapsProps) {
  const t = useTranslations('card');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (!tap || !tap.faces.length) return null;
  const names = facesNames(tap.faces, undefined, locale);
  const label = `${t('tap.facesAuthor', { names })}${tap.more ? (locale === 'en' ? `, ${t('tap.more')}` : `，${t('tap.more')}`) : ''}`;
  return (
    <div className={styles.line} data-tap-author="">
      <button type="button" className={styles.button} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className={styles.glyph} aria-hidden>
          <Icon name="wave" size={16} color="var(--color-text-muted)" />
        </span>
        <AvatarGroup members={tap.faces.map(memberOf)} size={28} />
      </button>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
      {open && <AuthorTapsDialog cardId={cardId} rows={tapRowsKnown({ people: tap.faces, more: tap.more })} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * The author's pages of who resonated, 30 at a time, newest first — in a centred dialog that waits the family's hold
 * for its first page and opens whole, or past it on as many stand-ins as the author's line has faces (round 33 §Q1),
 * in the rows' own region; 關閉 floats over the region's foot (§Q3).
 */
function AuthorTapsDialog({ cardId, rows, onClose }: { cardId: string; rows: number; onClose: () => void }) {
  const t = useTranslations('card');
  const tHome = useTranslations('home');
  const { data, size, setSize, isValidating } = useSWRInfinite<TapListBody>(
    (i, prev: TapListBody | null) => (i === 0 ? ['taps-author', cardId, ''] : prev?.nextPageToken ? ['taps-author', cardId, prev.nextPageToken] : null),
    ([, id, token]: [string, string, string]) => listTaps(id, token || null),
    { revalidateOnFocus: false, revalidateFirstPage: false },
  );
  const show = useTapListHold(!!data);
  if (!show) return null;
  const people = data?.flatMap((p) => p.people) ?? [];
  const next = data?.at(-1)?.nextPageToken;
  const loadingMore = isValidating && !!data && size > data.length;
  return (
    <Modal open onClose={onClose} maxWidth={480} seed={53} padding={TAP_DIALOG_PADDING} ariaLabel={t('resonatorsModal.title')} closeButton="float">
      <div className={styles.dialog}>
        {/* The title is the region's first child (round 34 §5: the region reaches the paper's top border). */}
        <DialogScroll>
          <h3 className={styles.title}>{t('resonatorsModal.title')}</h3>
          {data ? (
            <>
              <TapPeople people={people} onPick={onClose} />
              {next && (
                <div className={styles.more}>
                  <OrganicButton variant="tonal" size="sm" loading={loadingMore} onClick={() => void setSize(size + 1)}>
                    {tHome('moreBtn')}
                  </OrganicButton>
                </div>
              )}
            </>
          ) : (
            <TapPeopleSkeleton rows={rows} />
          )}
        </DialogScroll>
      </div>
    </Modal>
  );
}

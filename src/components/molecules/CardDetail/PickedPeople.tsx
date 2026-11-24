'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import useSWRInfinite from 'swr/infinite';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import type { TapListBody, TapPickedBody } from '@/lib/api/v1/schemas';
import { listTaps } from '@/lib/db/firestore/client/taps';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import type { StoryScript } from '@/lib/text/script';
import { TAP_LIST_DIALOG_WIDTH, TAP_LIST_PHONE_QUERY } from './TapFaces';
import { TAP_DIALOG_PADDING, TAP_LIST_HOLD_MS, tapRowsKnown, useTapListHold } from './tapList';
import { TapPeople, TapPeopleSkeleton } from './TapPeople';
import styles from './PickedPeople.module.css';

/** The paper's padding: the tap lists' family's (round 33 §Q2: 24 above and a side, the region to the paper's bottom). */
export const PICKED_PEOPLE_PADDING = TAP_DIALOG_PADDING;

/** How long the dialog waits for its first page before it opens on a stand-in: the family's hold (tapList). */
export const PICKED_HOLD_MS = TAP_LIST_HOLD_MS;

/**
 * How many rows the list will open with, known before it answers (round 32 §P3): the marks' own faces (`people`, at
 * most 3, the newest) — the first page holds exactly those when no one else picked it (`more` false). With `more`,
 * at least 3. Never under 1 (a mark is drawn only for a sentence someone picked). The family's count (tapList).
 */
export function pickedRowsKnown(passage: Pick<TapPickedBody, 'people' | 'more'>): number {
  return tapRowsKnown(passage);
}

export interface PickedPeopleProps {
  cardId: string;
  /** The sentence as its mark holds it: its id, its words, and its faces (how many rows the list opens with). */
  passage: Pick<TapPickedBody, 'id' | 'text'> & Partial<Pick<TapPickedBody, 'people' | 'more'>>;
  script: StoryScript;
  onClose: () => void;
}

/**
 * Who resonated with this sentence (round 29 §S4; the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句」, 「只列這一段的人」,
 * 「最新共振的在前面」): a centred dialog in the who-resonated dialog's shell and widths — a phone's 400 or the column less
 * 16 a side, 480 on a tablet, the Mac and the desktop; never a sheet, never a popover. Its title, the sentence once
 * (in the story's type at 16, muted, in full), then the people who picked it, newest first, as the author's list
 * draws a row — a face 36, the pen name, the note's first lines when they left one — with no quote under each name
 * (the sentence heads it); 顯示更多 when there is another page; the small 關閉 floating at the foot's end (round 33 §Q3). A row leads where
 * the same person's row in the author's list leads. The author's list itself is unchanged (「保留原本查看的这个这个框」).
 */
export function PickedPeople({ cardId, passage, script, onClose }: PickedPeopleProps) {
  const t = useTranslations('card.tap');
  const onPhone = useMediaQuery(TAP_LIST_PHONE_QUERY) !== false;
  const list = usePickedList(cardId, passage.id);
  // Round 32 §P3 (the owner: 「先跳出一个很高的弹窗，再根据内容缩回实际高度」): the dialog opened on three stand-in rows
  // whatever the count, then shrank to the one or two that came. It now waits a moment for the answer and opens whole;
  // past that, on stand-ins exactly as many as the mark's faces — so its first frame is its final height.
  // Round 33 §Q1: the family's one hold (tapList), as the who-resonated lists wait now too.
  const show = useTapListHold(!!list.data);
  if (!show) return null;
  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={onPhone ? TAP_LIST_DIALOG_WIDTH.phone : TAP_LIST_DIALOG_WIDTH.wide}
      seed={59}
      // The family's paper (round 33 §Q2): 24 above and a side; the rows' region runs to its bottom, 關閉 floating
      // over its foot (§Q3).
      padding={PICKED_PEOPLE_PADDING}
      ariaLabel={t('pickedTitle')}
      closeButton="float"
    >
      <div className={styles.picked} data-tap-picked="" id="tap-picked">
        {/* The title and the sentence head the region (round 34 §5: it reaches the paper's top border). */}
        <PickedList
          head={
            <div className={styles.head}>
              <h3 className={styles.title}>{t('pickedTitle')}</h3>
              <p className={styles.sentence} data-script={script}>
                {t('passageQuote', { text: passage.text })}
              </p>
            </div>
          }
          list={list}
          rows={pickedRowsKnown({ people: passage.people ?? [], more: passage.more ?? false })}
          onPick={onClose}
        />
      </div>
    </Modal>
  );
}

/**
 * The sentence's people, a page at a time (the list's pages), newest first. Keyed by the viewer too (Wave 2 #3b: a
 * reader reads it as well as the author, each their own blocks' answer), so one account's list never shows the next.
 */
function usePickedList(cardId: string, passage: string) {
  const viewer = useAuth().user?.id ?? '';
  return useSWRInfinite<TapListBody>(
    (i, prev: TapListBody | null) =>
      i === 0
        ? ['taps-picked', cardId, passage, '', viewer]
        : prev?.nextPageToken
          ? ['taps-picked', cardId, passage, prev.nextPageToken, viewer]
          : null,
    ([, id, p, token]: [string, string, string, string, string]) => listTaps(id, token || null, p),
    { revalidateOnFocus: false, revalidateFirstPage: false },
  );
}

function PickedList({ head, list, rows, onPick }: { head: ReactNode; list: ReturnType<typeof usePickedList>; rows: number; onPick: () => void }) {
  const tHome = useTranslations('home');
  const { data, size, setSize, isValidating } = list;
  // Still on its way past the hold: stand-ins of the loaded rows' own height (TapPeople's .row), as many as will come.
  // In the same scroll region as the rows (its 4 under the last band count too).
  if (!data)
    return (
      <DialogScroll>
        {head}
        <TapPeopleSkeleton rows={rows} />
      </DialogScroll>
    );
  const people = data.flatMap((p) => p.people);
  const next = data.at(-1)?.nextPageToken;
  const loadingMore = isValidating && size > data.length;
  // 顯示更多 ends the region's content (round 33 §Q3: the region reaches the paper's bottom, nothing stands under it).
  return (
    <DialogScroll>
      {head}
      <TapPeople people={people} onPick={onPick} quotes={false} endKey={next ? 'picked:more' : undefined} />
      {next && (
        <div className={styles.more}>
          <OrganicButton variant="tonal" size="sm" loading={loadingMore} onClick={() => void setSize(size + 1)}>
            {tHome('moreBtn')}
          </OrganicButton>
        </div>
      )}
    </DialogScroll>
  );
}

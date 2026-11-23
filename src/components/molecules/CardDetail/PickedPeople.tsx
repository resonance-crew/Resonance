'use client';

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
import { TapPeople, TapPeopleSkeleton } from './TapPeople';
import styles from './PickedPeople.module.css';

/** The paper's padding, the apps' `ModalPaper` inset (round 29 §S12): 32 above and below, 28 at each side. */
export const PICKED_PEOPLE_PADDING = '32px 28px';

export interface PickedPeopleProps {
  cardId: string;
  passage: Pick<TapPickedBody, 'id' | 'text'>;
  script: StoryScript;
  onClose: () => void;
}

/**
 * Who resonated with this sentence (round 29 §S4; the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句」, 「只列這一段的人」,
 * 「最新共振的在前面」): a centred dialog in the who-resonated dialog's shell and widths — a phone's 400 or the column less
 * 16 a side, 480 on a tablet, the Mac and the desktop; never a sheet, never a popover. Its title, the sentence once
 * (in the story's type at 16, muted, in full), then the people who picked it, newest first, as the author's list
 * draws a row — a face 36, the pen name, the note's first lines when they left one — with no quote under each name
 * (the sentence heads it); 顯示更多 when there is another page; the small 關閉 at the foot's end. A row leads where
 * the same person's row in the author's list leads. The author's list itself is unchanged (「保留原本查看的这个这个框」).
 */
export function PickedPeople({ cardId, passage, script, onClose }: PickedPeopleProps) {
  const t = useTranslations('card.tap');
  const onPhone = useMediaQuery(TAP_LIST_PHONE_QUERY) !== false;
  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={onPhone ? TAP_LIST_DIALOG_WIDTH.phone : TAP_LIST_DIALOG_WIDTH.wide}
      seed={59}
      // The apps' shell (§S12; the owner, 2026-11-22: 「留白够不够…把它一致」): 32 above and below, 28 a side.
      padding={PICKED_PEOPLE_PADDING}
      ariaLabel={t('pickedTitle')}
      closeButton
    >
      <div className={styles.picked} data-tap-picked="" id="tap-picked">
        <h3 className={styles.title}>{t('pickedTitle')}</h3>
        <p className={styles.sentence} data-script={script}>
          {t('passageQuote', { text: passage.text })}
        </p>
        <PickedList cardId={cardId} passage={passage.id} onPick={onClose} />
      </div>
    </Modal>
  );
}

/**
 * The sentence's people, a page at a time (the list's pages), newest first. Keyed by the viewer too (Wave 2 #3b: a
 * reader reads it as well as the author, each their own blocks' answer), so one account's list never shows the next.
 */
function PickedList({ cardId, passage, onPick }: { cardId: string; passage: string; onPick: () => void }) {
  const tHome = useTranslations('home');
  const viewer = useAuth().user?.id ?? '';
  const { data, size, setSize, isValidating } = useSWRInfinite<TapListBody>(
    (i, prev: TapListBody | null) =>
      i === 0
        ? ['taps-picked', cardId, passage, '', viewer]
        : prev?.nextPageToken
          ? ['taps-picked', cardId, passage, prev.nextPageToken, viewer]
          : null,
    ([, id, p, token]: [string, string, string, string, string]) => listTaps(id, token || null, p),
    { revalidateOnFocus: false, revalidateFirstPage: false },
  );
  if (!data) return <TapPeopleSkeleton />;
  const people = data.flatMap((p) => p.people);
  const next = data.at(-1)?.nextPageToken;
  const loadingMore = isValidating && size > data.length;
  return (
    <>
      <DialogScroll>
        <TapPeople people={people} onPick={onPick} quotes={false} endKey={next ? 'picked:more' : undefined} />
      </DialogScroll>
      {next && (
        <div className={styles.more}>
          <OrganicButton variant="tonal" size="sm" loading={loadingMore} onClick={() => void setSize(size + 1)}>
            {tHome('moreBtn')}
          </OrganicButton>
        </div>
      )}
    </>
  );
}

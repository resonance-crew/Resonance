'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BandRule, BandWash, bandHost, useBandPress } from '@/components/atoms/BandWash/BandWash';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import type { TapPassageBody } from '@/lib/api/v1/schemas';
import type { StoryScript } from '@/lib/text/script';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { BAND_END_KEY, bandsBelow } from '@/lib/design/listBands';
import { TAP_LIST_DIALOG_WIDTH, TAP_LIST_PHONE_QUERY } from './TapFaces';
import { TAP_DIALOG_PADDING } from './tapList';
import { PASSAGE_CHOSEN_MS, reducedMotion } from './tapMotion';
import styles from './TapPassages.module.css';

export { PASSAGE_CHOSEN_MS, reducedMotion };

export interface TapPassagesProps {
  /** The card's passages (`CardDetail.tap.passages`): two or three of the author's own sentences. */
  passages: TapPassageBody[];
  /** The reader's pick now (`CardDetail.tap.passage`): its row rests in the press ink (no check, round 35). */
  picked: string | null;
  /** The story's script: the rows are set in its type and leading, as story.css sets the story (§U1.3). CJK by default. */
  script?: StoryScript;
  /** A row was chosen: its id, or null when the picked row was pressed again (the pick cleared). */
  onPick: (passage: string | null) => void;
  /** It closes: 略過, Escape, the backdrop, or a moment after a pick. */
  onClose: () => void;
  /**
   * False only for the release screenshots' hold (`?visualTap=`): a page opened with the dialog already up has had
   * no pointer on it, so the browser would ring the focused row as a keyboard's — which a reader who pressed 共振
   * with a pointer or a finger never sees. The row's focus is then left to the dialog's own.
   */
  focusRow?: boolean;
}

/**
 * After a press that turns 共振 on (round 27 §U1): a small centred dialog asking which part stayed with the reader —
 * one scroll region holding the title and then the author's own sentences as banded rows (the who-resonated list's
 * bands), each in the story's type and wrapped in full, never cut, a quiet rule between two rows (round 32 §P1, §P2);
 * 略過 alone at the foot's end, the family's small tonal pill floating over the region's bottom fade, never moving
 * with the rows (round 33 §Q3; the region reaches the paper's bottom). A press holds the row's ink, then
 * the dialog closes; the picked row, reopened from the reader's own row, rests chosen and a press on it clears the
 * pick. The tap never waits on it: skipping leaves the tap on with no passage. Never a bottom sheet, never a popover.
 */
export function TapPassages({ passages, picked, script = 'cjk', onPick, onClose, focusRow = true }: TapPassagesProps) {
  const t = useTranslations('card.tap');
  const onPhone = useMediaQuery(TAP_LIST_PHONE_QUERY) !== false;
  // The row just pressed, holding its ink (unless it cleared the pick) until the dialog closes.
  const [chosen, setChosen] = useState<{ id: string; on: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus on the first row, or on the picked one (§U1.8), so the keyboard and a screen reader start there.
  // After the dialog's own focus (Modal puts it on its paper once it has measured it, a few frames in): for a short
  // while, focus that sits on the paper or nowhere moves to the row; a row or 略過 the reader reached is left alone.
  const pickedAtOpen = useRef(picked);
  useEffect(() => {
    if (!focusRow) return;
    let frames = 0;
    let handle = 0;
    const step = () => {
      const list = listRef.current;
      const at = pickedAtOpen.current;
      const target = (at && list?.querySelector<HTMLButtonElement>(`[data-passage="${at}"]`)) || list?.querySelector<HTMLButtonElement>('[data-passage]');
      const now = document.activeElement;
      if (target && (!now || now === document.body || now.getAttribute('role') === 'dialog' || !now.closest('[role="dialog"]'))) {
        target.focus({ preventScroll: true });
      }
      if (++frames < 30) handle = window.setTimeout(step, 16);
    };
    handle = window.setTimeout(step, 0);
    return () => window.clearTimeout(handle);
    // Read once, as the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: string) => {
    if (chosen) return;
    const next = id === picked ? null : id;
    setChosen({ id, on: next !== null });
    onPick(next);
    if (reducedMotion()) onClose();
    else timer.current = window.setTimeout(onClose, PASSAGE_CHOSEN_MS);
  };

  const keys = passages.map((p) => `passage:${p.id}`);
  const below = bandsBelow(keys, BAND_END_KEY);
  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={onPhone ? TAP_LIST_DIALOG_WIDTH.phone : TAP_LIST_DIALOG_WIDTH.wide}
      seed={47}
      // The family's paper (round 33 §Q2): 24 above and a side, the region to its bottom.
      padding={TAP_DIALOG_PADDING}
      ariaLabel={t('passageTitle')}
      closeLabel={t('passageSkip')}
      closeButton="float"
    >
      <div data-tap-passages="" data-script={script} className={styles.body}>
        {/* One scroll region (round 32 §P1, the owner: 「整个弹窗只有一个统一滚动区，标题随文字滚走」): the title is its first
            child; 略過 floats over its foot (round 33 §Q3). */}
        <DialogScroll>
          <h3 className={styles.title}>{t('passageTitle')}</h3>
          <ul ref={listRef} className={styles.list}>
            {passages.map((p, i) => {
              const on = chosen ? chosen.id === p.id && chosen.on : picked === p.id;
              const inked = chosen ? chosen.id === p.id : picked === p.id;
              return (
                <li key={p.id} className={styles.item}>
                  {/* Between two rows only (§P2): the quiet rule from the words' start to their end, on the boundary (it
                      takes no room), under a held row's see-through band — the band's own edge (round 34 §6: BandRule
                      strokes the very curve the bands on either side end on), so a press fills exactly to it. */}
                  {i > 0 && <BandRule curveKey={keys[i]} className={styles.rule} />}
                  <PassageRow
                    id={p.id}
                    index={i}
                    text={p.text}
                    selected={on}
                    inked={inked}
                    band={{ top: keys[i], bottom: below[i] }}
                    onPress={() => choose(p.id)}
                  />
                </li>
              );
            })}
          </ul>
        </DialogScroll>
      </div>
    </Modal>
  );
}

function PassageRow({
  id,
  index,
  text,
  selected,
  inked,
  band,
  onPress,
}: {
  id: string;
  index: number;
  text: string;
  selected: boolean;
  inked: boolean;
  band: { top: string; bottom: string };
  onPress: () => void;
}) {
  const press = useBandPress();
  return (
    <button
      type="button"
      className={`${styles.row} ${bandHost}`}
      data-passage={id}
      data-testid={`tap-passage-${index}`}
      aria-pressed={selected}
      onClick={onPress}
      {...press}
      // The chosen row keeps the press ink (§U1.5, §U1.7) whatever the pointer does.
      {...(inked ? { 'data-band-pressed': '' } : {})}
    >
      <BandWash topKey={band.top} bottomKey={band.bottom} />
      {/* No check (round 35, the owner: 「把这个 dialog 里面的勾勾拿掉……选中的就是现在的这个变色的效果就好了」): the
          chosen row is its resting ink alone, and the words have the row's whole width. */}
      <span className={styles.rowInner}>
        <span className={styles.text}>{text}</span>
      </span>
    </button>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BandWash, bandHost, useBandPress } from '@/components/atoms/BandWash/BandWash';
import { Icon } from '@/components/atoms/Icon';
import { Modal } from '@/components/molecules/Modal/Modal';
import { DialogScroll } from '@/components/sections/AppHeader/BellList';
import type { TapPassageBody } from '@/lib/api/v1/schemas';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { BAND_END_KEY, bandsBelow } from '@/lib/design/listBands';
import { TAP_LIST_DIALOG_WIDTH, TAP_LIST_PHONE_QUERY } from './TapFaces';
import styles from './TapPassages.module.css';

/** How long a chosen row holds its ink and check before the dialog closes (§U1.5); at once under reduced motion. */
export const PASSAGE_CHOSEN_MS = 300;

/** Whether the reader asked for less motion (a test's jsdom has no matchMedia: motion as usual). */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface TapPassagesProps {
  /** The card's passages (`CardDetail.tap.passages`): two or three of the author's own sentences. */
  passages: TapPassageBody[];
  /** The reader's pick now (`CardDetail.tap.passage`): its row rests in the press ink with its check. */
  picked: string | null;
  /** A row was chosen: its id, or null when the picked row was pressed again (the pick cleared). */
  onPick: (passage: string | null) => void;
  /** It closes: 略過, Escape, the backdrop, or a moment after a pick. */
  onClose: () => void;
}

/**
 * After a press that turns 共振 on (round 27 §U1): a small centred dialog asking which part stayed with the reader —
 * the title, then the author's own sentences as banded rows (the who-resonated list's bands), each in the story's type
 * and wrapped in full, never cut; 略過 alone at the foot's end. A press holds the row's ink and draws its check, then
 * the dialog closes; the picked row, reopened from the reader's own row, rests chosen and a press on it clears the
 * pick. The tap never waits on it: skipping leaves the tap on with no passage. Never a bottom sheet, never a popover.
 */
export function TapPassages({ passages, picked, onPick, onClose }: TapPassagesProps) {
  const t = useTranslations('card.tap');
  const onPhone = useMediaQuery(TAP_LIST_PHONE_QUERY) !== false;
  // The row just pressed, holding its ink (and its check, unless it cleared the pick) until the dialog closes.
  const [chosen, setChosen] = useState<{ id: string; on: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus on the first row, or on the picked one (§U1.8), so the keyboard and a screen reader start there.
  // After the dialog's own focus (Modal puts it on its paper once it has measured it, a few frames in): for a short
  // while, focus that sits on the paper or nowhere moves to the row; a row or 略過 the reader reached is left alone.
  const pickedAtOpen = useRef(picked);
  useEffect(() => {
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
      padding="24px 22px 22px"
      ariaLabel={t('passageTitle')}
      closeLabel={t('passageSkip')}
      closeButton
    >
      <div data-tap-passages="" className={styles.body}>
        <h3 className={styles.title}>{t('passageTitle')}</h3>
        <DialogScroll>
          <ul ref={listRef} className={styles.list}>
            {passages.map((p, i) => {
              const on = chosen ? chosen.id === p.id && chosen.on : picked === p.id;
              const inked = chosen ? chosen.id === p.id : picked === p.id;
              return (
                <li key={p.id}>
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
      <span className={styles.rowInner}>
        <span className={styles.text}>{text}</span>
        {selected && (
          <span className={styles.check} aria-hidden>
            <Icon name="check" size={16} />
          </span>
        )}
      </span>
    </button>
  );
}

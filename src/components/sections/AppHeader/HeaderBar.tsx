'use client';

import type { ReactNode, Ref } from 'react';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HeaderChrome, HEADER_STROKE_Y, HEADER_TOTAL_H } from './HeaderChrome';
import styles from './HeaderBar.module.css';

export interface HeaderBarProps {
  title: ReactNode;
  /** The arrow's name for a screen reader, and its tooltip. */
  backLabel: string;
  onBack: () => void;
  /** The arrow waits (a request on its way that leaving would cut short). */
  backDisabled?: boolean;
  /** Something lies under the pen line: it inks in whole, and wider screens' paper firms up. */
  scrolled?: boolean;
  /** The title is the page's own heading (the writer has no other), not a label over one. */
  heading?: boolean;
  /**
   * What closes the row on the right (the writer's 下一步): it keeps its size, and the title gives way —
   * it ellipsizes first, down to 320px.
   */
  trailing?: ReactNode;
  /**
   * The title (a `heading` one), for a host that moves the focus to it (the writer's publish step names
   * itself here): set, the title takes the focus from script (tabIndex -1).
   */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * A page's own bar, drawn in the app header's likeness — the apps' inline
 * bar: the back arrow and the screen's title on the header's paper, what
 * scrolls passing under its pen line, and what the page does next at its
 * end. A phone's settings detail claims the app header with it; the writer
 * stands it over its workspace below the split.
 */
export function HeaderBar({
  title,
  backLabel,
  onBack,
  backDisabled = false,
  scrolled = false,
  heading = false,
  trailing,
  titleRef,
}: HeaderBarProps) {
  return (
    <header className={styles.bar} style={{ height: HEADER_TOTAL_H }}>
      <HeaderChrome scrolled={scrolled} />
      <div className={styles.row} style={{ height: HEADER_STROKE_Y }}>
        <BareIconButton
          icon="arrow-right"
          mirror
          tone="ink"
          label={backLabel}
          iconSize={18}
          tip="below"
          tipAlign="start"
          seed={13}
          className={styles.back}
          disabled={backDisabled}
          onClick={onBack}
        />
        {heading ? (
          <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className={styles.title}>
            {title}
          </h1>
        ) : (
          <span className={styles.title}>{title}</span>
        )}
        {trailing != null && <div className={styles.trailing}>{trailing}</div>}
      </div>
    </header>
  );
}

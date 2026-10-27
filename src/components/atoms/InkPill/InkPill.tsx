'use client';

import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './InkPill.module.css';

export interface InkPillProps {
  /** The words (a node, so a toast can set its action's word in bold). */
  label: ReactNode;
  icon?: IconName;
  /** Makes the whole pill a button. */
  onClick?: () => void;
  /** The button's (or the status's) accessible name, when the words alone aren't it. */
  ariaLabel?: string;
  /** `sm`: the thread's pill over its foot; `md`: a toast. */
  size?: 'sm' | 'md';
  /**
   * A pill without `onClick` that speaks its words as a polite status
   * (`role="status"`) — for one used on its own, as the thread's 已複製. Off,
   * the face is hidden from assistive tech: the toast host's one live region
   * speaks a toast's words instead.
   */
  announce?: boolean;
  /** Where it sits (the face's own look is fixed). */
  className?: string;
}

const GLYPH = { sm: 14, md: 16 } as const;

/**
 * A small word over the page that something happened, or the way to act on
 * it: a wobbly terracotta-light wash with no pen line (a fill marks a button —
 * the whole pill is one when it has `onClick`), lifted off the page by the
 * paper-cut shadow (--cutout-shadow). The face of the thread's way
 * back to the latest message and of every toast (molecules/Toast); its
 * numbers are the thread pill's tuned legacy recipe.
 */
export function InkPill({ label, icon, onClick, ariaLabel, size = 'sm', announce = false, className }: InkPillProps) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref);
  const body = (
    <>
      <HandDrawnBorder w={w} h={h} R={h / 2} seed={41} mag={1.2} segmentsH={2} segmentsV={1} curve={1.4} fillColor="var(--color-terracotta-light)" />
      {icon && <Icon name={icon} size={GLYPH[size]} className={styles.glyph} />}
      <span className={styles.label}>{label}</span>
    </>
  );
  const shared = {
    className: [styles.pill, className, 'res-shape-stand-in'].filter(Boolean).join(' '),
    'data-size': size,
    'data-shape-pending': w > 0 && h > 0 ? undefined : '',
    style: { '--shape-fill': 'var(--color-terracotta-light)', '--shape-radius': '999px' } as CSSProperties,
  };
  if (onClick) {
    return (
      <button ref={ref as RefObject<HTMLButtonElement>} type="button" onClick={onClick} aria-label={ariaLabel} {...shared}>
        {body}
      </button>
    );
  }
  return (
    <span
      ref={ref as RefObject<HTMLSpanElement>}
      {...(announce ? { role: 'status', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
      {...shared}
    >
      {body}
    </span>
  );
}

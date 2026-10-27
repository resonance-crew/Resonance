'use client';

import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK } from '@/lib/design/strokes';
import styles from './InkPill.module.css';

export interface InkPillProps {
  /** The words (a node, so a toast can set its action's word in bold); none for a glyph alone in a round face (`ariaLabel` names it). */
  label?: ReactNode;
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
/** A glyph alone (the thread's way back to the latest message): the arrow a little larger in its face. */
const GLYPH_ALONE = 18;

/**
 * The face around a glyph alone (the owner, 2026-10-28): an avatar's hand (HandDrawnAvatar's recipe — one
 * segment a side, its curve, a jitter and a shift at each corner, a wobble by its size), a step rounder — its
 * corners 42 % of its size (an avatar's 40 %, a circle's 50 %), its corners' jitter and shift calmer (2 and 4 %,
 * an avatar's 3.2 and 6 %): organic, not a coin. The apps' OrganicPillGlyph draws the same numbers.
 */
function glyphFace(s: number) {
  return { R: s * 0.42, mag: s * 0.022, segmentsH: 1, segmentsV: 1, curve: 1.3, cornerJitter: 2, cornerOffset: s * 0.04 };
}

/** Its corners: the thread's pill is round; a toast's are a card's. */
const RADIUS = { sm: (h: number) => h / 2, md: () => 16 } as const;

/**
 * A small word over the page that something happened, or the way to act on
 * it, made as a card is (round 18, the owner's): a fill of its own colour —
 * the accent's light wash — inside one hand-drawn pen line of the accent, and
 * flat, as the whole page is: what floats is told by its line, never a
 * shadow. The face of the thread's way back to the latest message (a pill)
 * and of every toast (molecules/Toast, a card's corners); the whole face is
 * a button when it has `onClick`.
 */
export function InkPill({ label, icon, onClick, ariaLabel, size = 'sm', announce = false, className }: InkPillProps) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref);
  const glyphOnly = label == null && !!icon;
  const body = (
    <>
      <HandDrawnBorder
        w={w}
        h={h}
        {...(glyphOnly
          ? glyphFace(h)
          : { R: RADIUS[size](h), mag: 1.2, segmentsH: 2, segmentsV: 1, curve: 1.4 })}
        seed={41}
        fillColor="var(--color-terracotta-light)"
        strokeColor="var(--color-terracotta)"
        strokeWidth={INK}
      />
      {icon && <Icon name={icon} size={glyphOnly ? GLYPH_ALONE : GLYPH[size]} className={styles.glyph} />}
      {!glyphOnly && <span className={styles.label}>{label}</span>}
    </>
  );
  const shared = {
    className: [styles.pill, className, 'res-shape-stand-in'].filter(Boolean).join(' '),
    'data-size': size,
    'data-glyph': glyphOnly || undefined,
    'data-shape-pending': w > 0 && h > 0 ? undefined : '',
    style: {
      '--shape-fill': 'var(--color-terracotta-light)',
      '--shape-ink': 'var(--color-terracotta)',
      '--shape-ink-width': `${INK}px`,
      '--shape-radius': glyphOnly ? '42%' : size === 'sm' ? '999px' : '16px',
    } as CSSProperties,
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

'use client';

import { copyFor } from './copy';
import { PillButton, type PillFace } from './PillLink';
import { setResting, useResting } from './rest';
import styles from './oneday.module.css';

function Glyph({ resting }: { resting: boolean }) {
  return (
    <svg className={styles.restGlyph} viewBox="0 0 20 20" aria-hidden="true">
      {resting ? (
        // a little sun: waking
        <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="10" cy="10" r="3.6" />
          <path d="M10 2.6v2M10 15.4v2M2.6 10h2M15.4 10h2M4.8 4.8l1.4 1.4M13.8 13.8l1.4 1.4M4.8 15.2l1.4-1.4M13.8 6.2l1.4-1.4" />
        </g>
      ) : (
        // a crescent: resting
        <path d="M13.6 13.9A6.2 6.2 0 0 1 7.4 4.1a6.3 6.3 0 1 0 7.9 8.9 6 6 0 0 1-1.7.9Z" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * The page's one pause (WCAG 2.2.2): every stage stops, nothing loops. Pressed while they rest. `quiet`: the hero's,
 * a glyph and a word in the muted ink, no fill (a 44 px target) — not an action beside the page's real ones; the
 * footer's is a pill on the night paper.
 */
export function RestToggle({ locale, face = 'tonal', className }: { locale: string; face?: PillFace | 'quiet'; className?: string }) {
  const c = copyFor(locale).rest;
  const resting = useResting();
  if (face === 'quiet') {
    return (
      <button type="button" className={`${styles.quietToggle} ${className ?? ''}`} aria-pressed={resting} onClick={() => setResting(!resting)}>
        <Glyph resting={resting} />
        <span>{resting ? c.on : c.off}</span>
      </button>
    );
  }
  return (
    <PillButton face={face} size="sm" pressed={resting} onClick={() => setResting(!resting)} className={className}>
      <Glyph resting={resting} />
      {resting ? c.on : c.off}
    </PillButton>
  );
}

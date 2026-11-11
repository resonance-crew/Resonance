'use client';

import { useEffect } from 'react';
import { INK_LIGHT } from '@/lib/design/strokes';
import { copyFor } from './copy';
import { setResting, useResting } from './rest';
import s from './issue.module.css';

/**
 * 「讓小紙團休息 / 叫醒小紙團」: pauses every stage on the page, the ripple and the stills' breathing (WCAG 2.2.2). It also
 * marks the issue's root (`data-rest`) so the CSS can hold what loops. Its words say what it will do, so it carries
 * no aria-pressed as well (a toggle whose label changes would be read 「叫醒小紙團，已按下」).
 */
export function RestToggle({ locale, className }: { locale: string; className?: string }) {
  const t = copyFor(locale);
  const resting = useResting();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-issue]');
    if (!root) return;
    if (resting) root.dataset.rest = '';
    else delete root.dataset.rest;
  }, [resting]);
  return (
    <button
      type="button"
      className={[s.rest, className].filter(Boolean).join(' ')}
      onClick={() => setResting(!resting)}
    >
      <svg className={s.restMark} viewBox="0 0 16 10" aria-hidden="true">
        {resting ? (
          // asleep: a small "z" of the pen
          <path d="M3 2.5 H8.5 L3 8 H9 M10.5 2 H13.5 L10.5 5 H13.8" fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          // awake: two dashes of a pause
          <path d="M5.5 1.5 V8.5 M10.5 1.5 V8.5" fill="none" stroke="currentColor" strokeWidth={INK_LIGHT * 1.4} strokeLinecap="round" />
        )}
      </svg>
      {resting ? t.rest.on : t.rest.off}
    </button>
  );
}

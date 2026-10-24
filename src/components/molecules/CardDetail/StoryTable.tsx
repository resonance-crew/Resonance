'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** Which side of a table wider than its column has more to see (src/styles/story.css fades it). */
export type TableMore = 'start' | 'end' | 'both' | null;

/** What a scroller's position says is left out of view, a pixel's slack either way. */
export function tableMore(scrollLeft: number, scrollWidth: number, clientWidth: number): TableMore {
  if (scrollWidth - clientWidth <= 1) return null;
  const start = scrollLeft > 1;
  const end = scrollLeft + clientWidth < scrollWidth - 1;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : null;
}

/**
 * A story's table as the reader draws it (round 8 §5.2): the table in a box
 * of its own that scrolls sideways when it is wider than the column — never
 * the page — and says which side has more by fading it (`data-more`). The box
 * is a named region a keyboard can scroll (it takes the focus); its look is
 * story.css's `.story-table`.
 */
export function StoryTable({ children }: { children?: ReactNode }) {
  const t = useTranslations('card');
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<TableMore>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setMore(tableMore(el.scrollLeft, el.scrollWidth, el.clientWidth));
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className="story-table" role="region" aria-label={t('table')} tabIndex={0} data-more={more ?? undefined}>
      <table>{children}</table>
    </div>
  );
}

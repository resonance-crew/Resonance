'use client';

import { useEffect, useState } from 'react';

/**
 * Whether two places on a page can't be seen at once (round 12 §5–6): the
 * span from the top of `start` to the foot of `end` — and the `extra` row
 * about to be drawn under it — is taller than the window shows under its
 * `header`. The card page asks it of its byline and its story's end, and
 * repeats the card's share · ⋯ at the end only then: on a short story both
 * are in view, and a second pair would only say the same thing twice.
 *
 * False until measured (so nothing is drawn and then taken away on a short
 * story); measured again whenever the page's size changes — pictures
 * arriving, the story read again — and when the window does. The two are
 * elements (callback refs into state), so it starts over whenever either is
 * drawn anew.
 */
export function useEndsApart(
  start: HTMLElement | null,
  end: HTMLElement | null,
  { header, extra }: { header: number; extra: number },
): boolean {
  const [apart, setApart] = useState(false);
  useEffect(() => {
    const top = start;
    const foot = end;
    if (!top || !foot) {
      setApart(false);
      return;
    }
    // Two rects, read at once (the observer already calls back at most once a frame).
    const measure = () => {
      const span = foot.getBoundingClientRect().bottom + extra - top.getBoundingClientRect().top;
      setApart(span > window.innerHeight - header);
    };
    measure();
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resized?.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      resized?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [start, end, header, extra]);
  return apart;
}

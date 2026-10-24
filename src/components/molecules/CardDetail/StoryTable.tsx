'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { tableRules, type TableRule } from '@/lib/design/tableRules';

/** Which side of a table wider than its column has more to see (src/styles/story.css fades it). */
export type TableMore = 'start' | 'end' | 'both' | null;

/** What a scroller's position says is left out of view, a pixel's slack either way. */
export function tableMore(scrollLeft: number, scrollWidth: number, clientWidth: number): TableMore {
  if (scrollWidth - clientWidth <= 1) return null;
  const start = scrollLeft > 1;
  const end = scrollLeft + clientWidth < scrollWidth - 1;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : null;
}

/** Where the table sits in its scroller, its size, and its row boundaries — what its pen rules are drawn on. */
interface Measured {
  left: number;
  top: number;
  width: number;
  height: number;
  headBottom: number | null;
  rowTops: number[];
}

const sameMeasure = (a: Measured | null, b: Measured) =>
  !!a &&
  a.left === b.left &&
  a.top === b.top &&
  a.width === b.width &&
  a.height === b.height &&
  a.headBottom === b.headBottom &&
  a.rowTops.length === b.rowTops.length &&
  a.rowTops.every((y, i) => y === b.rowTops[i]);

const px = (n: number) => Math.round(n * 2) / 2;

/** The table's place in its scroller and its row boundaries, from the table's top-left (null before layout). */
function measure(box: HTMLElement, table: HTMLTableElement): Measured | null {
  const b = box.getBoundingClientRect();
  const r = table.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  const head = table.tHead?.rows[table.tHead.rows.length - 1] ?? null;
  const body = Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows));
  return {
    left: px(r.left - b.left + box.scrollLeft - box.clientLeft),
    top: px(r.top - b.top + box.scrollTop - box.clientTop),
    width: px(r.width),
    height: px(r.height),
    headBottom: head ? px(head.getBoundingClientRect().bottom - r.top) : null,
    rowTops: body.slice(1).map((tr) => px(tr.getBoundingClientRect().top - r.top)),
  };
}

/**
 * A story's table as the reader draws it (round 8 §5.2, round 9 §6): the
 * table in a box of its own that scrolls sideways when it is wider than the
 * column — never the page — and says which side has more by fading it
 * (`data-more`). The box is a named region a keyboard can scroll (it takes
 * the focus); its look is story.css's `.story-table`.
 *
 * Its rules are the pen's (lib/design/tableRules): once the table is measured
 * an overlay inside the scroller draws them across the table's full width, so
 * they move with the columns and fade with them; until then (the server's
 * HTML) the straight CSS rules stand in, and `data-ruled` hands over to the
 * pen without moving a row. `seed` is where the table sits in its story, so a
 * story draws its tables the same way every time.
 */
export function StoryTable({ children, seed = 0 }: { children?: ReactNode; seed?: number }) {
  const t = useTranslations('card');
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<TableMore>(null);
  const [m, setM] = useState<Measured | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const table = el.querySelector('table');
    const read = () => setMore(tableMore(el.scrollLeft, el.scrollWidth, el.clientWidth));
    const layout = () => {
      read();
      const next = table ? measure(el, table) : null;
      if (next) setM((prev) => (sameMeasure(prev, next) ? prev : next));
    };
    layout();
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
    ro?.observe(el);
    if (table) ro?.observe(table);
    return () => {
      el.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, []);
  const rules: TableRule[] = m ? tableRules(m.width, m.headBottom, m.rowTops, seed) : [];
  return (
    <div
      ref={ref}
      className="story-table"
      role="region"
      aria-label={t('table')}
      tabIndex={0}
      data-more={more ?? undefined}
      data-ruled={rules.length ? '' : undefined}
    >
      <table>{children}</table>
      {m && rules.length > 0 && (
        <svg
          className="story-table-rules res-shape-fade-in"
          aria-hidden="true"
          focusable="false"
          width={m.width}
          height={m.height}
          style={{ left: m.left, top: m.top }}
        >
          {rules.map((r, i) => (
            <path
              key={i}
              d={r.d}
              data-kind={r.kind}
              transform={`translate(${r.x} ${r.y})`}
              strokeWidth={r.stroke}
              fill="none"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

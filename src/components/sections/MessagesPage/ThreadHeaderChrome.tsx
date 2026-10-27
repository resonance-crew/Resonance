'use client';

import { useMemo, useRef } from 'react';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import pageStyles from './MessagesPage.module.css';

/** The thread header's row (its 38px content + 10px above and below). */
export const THREAD_HEADER_H = 58;
/** The band under the row the wave lies in — the app header's (HEADER_WAVE_H). */
const WAVE_BAND = 14;
/** Where the pen line runs: as the app header's, 0.35 of the way into its band. */
const LINE_Y = THREAD_HEADER_H + WAVE_BAND * 0.35;

/** How far the header's wave leans off its line. */
const WAVE_AMP = 1.4;

/** The header's wave, across a header `w` wide (its chrome's coordinates). */
function headerWave(w: number): [number, number][] {
  return wavyPoints(w, LINE_Y, WAVE_AMP, 41, 12);
}

/** The paper (cream down to the wave) and the pen line, across a header `w` wide. */
export function threadHeaderPaths(w: number): { paper: string; line: string } {
  const pts = headerWave(w);
  const line = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let paper = `M 0,0 L ${f(w)},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    paper += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return { paper: `${paper} Z`, line };
}

/**
 * The thread header's paper and wavy pen line — the app header's treatment
 * (design note §4): opaque cream that stops on the wave, the messages
 * scrolling beneath it and vanishing exactly there. The line is half ink
 * while the whole history fits (nothing under it), whole otherwise — on a
 * phone; beside the list it is the rule's pen, constant (the module CSS).
 */
export function ThreadHeaderChrome({ under }: { under: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(ref);
  const paths = useMemo(() => (w > 0 ? threadHeaderPaths(w) : null), [w]);
  const h = THREAD_HEADER_H + WAVE_BAND;
  return (
    <div ref={ref} className={pageStyles.threadChrome} aria-hidden>
      {paths && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={pageStyles.threadChromeSvg}>
          <path d={paths.paper} fill="var(--color-cream)" />
          <path
            d={paths.line}
            fill="none"
            stroke="var(--field-border-hover)"
            strokeWidth={INK}
            strokeLinecap="round"
            opacity={under ? 1 : 0.5}
            className={pageStyles.threadChromeLine}
          />
        </svg>
      )}
    </div>
  );
}

/**
 * The thread's body on the screen (round 17 §2.1): what holding a message dims
 * — from just under the header's pen line to the window's foot, the composer
 * with it; on two panes from the rule between the list and the thread (the
 * list, the rule and the header stay crisp), on a phone the window's width.
 */
export interface ThreadBodyArea {
  /** The scrim's box on the screen. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Its outline in its own box: its top edge follows the header's wave, just under the pen line. */
  clip: string;
  /** Where the body starts under the wave's lowest point: the menu and the reactions keep below it. */
  bodyTop: number;
}

/**
 * Measures the body under a thread's `header` (the `.threadHeader` row holding
 * its chrome), beside the vertical `rule` when two panes show (null or
 * unlaid-out on a phone), in a window `winW` × `winH`.
 */
export function threadBodyArea(header: HTMLElement, rule: HTMLElement | null, winW: number, winH: number): ThreadBodyArea {
  const head = header.getBoundingClientRect();
  const chromeEl = header.querySelector<HTMLElement>(`.${pageStyles.threadChrome}`);
  const chrome = chromeEl?.getBoundingClientRect() ?? head;
  const ruleBox = rule?.getBoundingClientRect();
  const left = ruleBox && ruleBox.width > 0 ? ruleBox.right : 0;
  // The box starts above the wave's highest crest; its outline starts on the pen line's lower edge.
  const top = head.top + LINE_Y - WAVE_AMP - INK;
  const width = Math.max(0, winW - left);
  const height = Math.max(0, winH - top);
  const f = (n: number) => +n.toFixed(2);
  const pts = headerWave(chrome.width).map(([x, y]): [number, number] => [f(x + chrome.left - left), f(y + head.top - top + INK / 2)]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const edge: [number, number][] = [[Math.min(first[0], 0) - 2, first[1]], ...pts, [Math.max(last[0], width) + 2, last[1]]];
  const clip = `${pointsToBezier(edge)} L ${f(Math.max(last[0], width) + 2)},${f(height + 2)} L ${f(Math.min(first[0], 0) - 2)},${f(height + 2)} Z`;
  return { left, top, width, height, clip, bodyTop: head.top + LINE_Y + WAVE_AMP + INK };
}

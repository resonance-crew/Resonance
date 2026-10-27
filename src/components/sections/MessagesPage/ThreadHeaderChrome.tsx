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
 * with it; on two panes from the rule between the list and the thread, its
 * leading edge following the rule's own pen line (review D2: no undimmed seam
 * beside it, the line itself left crisp), the list, the rule and the header
 * crisp; on a phone the window's width.
 */
export interface ThreadBodyArea {
  /** The scrim's box on the screen. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Its outline in its own box: its top edge follows the header's wave, just under the pen line; on two panes its
   * leading edge the rule's pen line. */
  clip: string;
  /** Where the body starts under the wave's lowest point: the menu and the reactions keep below it. */
  bodyTop: number;
}

/** How far the scrim reaches under the rule's pen from its trailing edge (its anti-aliased rim), so no paper shows. */
const RULE_TUCK = 0.4;
/** One sample of the rule's line per this many px of its length on the screen. */
const RULE_STEP = 6;

/**
 * The rule's pen line on the screen, top to bottom: points along its drawn path (the Divider's wave, through
 * its viewBox and transform), or null where the browser can't say (no layout).
 */
export function rulePenLine(rule: HTMLElement): [number, number][] | null {
  const path = rule.querySelector('path') as SVGPathElement | null;
  if (!path || typeof path.getTotalLength !== 'function' || typeof path.getScreenCTM !== 'function') return null;
  const m = path.getScreenCTM();
  const len = path.getTotalLength();
  if (!m || !(len > 0)) return null;
  const n = Math.min(400, Math.max(8, Math.ceil((len * Math.hypot(m.c, m.d)) / RULE_STEP)));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const q = path.getPointAtLength((len * i) / n);
    pts.push([m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  return pts;
}

/** The line's x at `y`, between the samples either side (its ends held beyond them). */
function xAt(line: [number, number][], y: number): number {
  if (y <= line[0][1]) return line[0][0];
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i];
    if (y <= y1) {
      const [x0, y0] = line[i - 1];
      return y1 === y0 ? x1 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
  }
  return line[line.length - 1][0];
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
  const twoPanes = !!rule && !!ruleBox && ruleBox.width > 0;
  // The rule's pen, its trailing rim: where the scrim starts on two panes (the line's own wave, else its middle).
  const pen = twoPanes ? rulePenLine(rule!) : null;
  const rim = (x: number) => x + INK / 2 - RULE_TUCK;
  const left = !twoPanes
    ? 0
    : pen
      ? Math.floor(Math.min(...pen.map(([x]) => rim(x))))
      : rim(ruleBox!.left + ruleBox!.width / 2);
  // The box starts above the wave's highest crest; its outline starts on the pen line's lower edge.
  const top = head.top + LINE_Y - WAVE_AMP - INK;
  const width = Math.max(0, winW - left);
  const height = Math.max(0, winH - top);
  const f = (n: number) => +n.toFixed(2);
  const pts = headerWave(chrome.width).map(([x, y]): [number, number] => [f(x + chrome.left - left), f(y + head.top - top + INK / 2)]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const right = Math.max(last[0], width) + 2;
  const bottom = height + 2;
  if (!pen) {
    const edge: [number, number][] = [[Math.min(first[0], 0) - 2, first[1]], ...pts, [right, last[1]]];
    const clip = `${pointsToBezier(edge)} L ${f(right)},${f(bottom)} L ${f(Math.min(first[0], 0) - 2)},${f(bottom)} Z`;
    return { left, top, width, height, clip, bodyTop: head.top + LINE_Y + WAVE_AMP + INK };
  }
  // Two panes: the top edge from the rule's line along the header's wave, down the window's end, along its foot back
  // to the line, and up the line's trailing rim to where it began.
  const line = pen.map(([x, y]): [number, number] => [rim(x) - left, y - top]);
  const startX = xAt(line, first[1]);
  const edge: [number, number][] = [[startX, first[1]], ...pts.filter(([x]) => x > startX + 1), [right, last[1]]];
  let clip = `${pointsToBezier(edge)} L ${f(right)},${f(bottom)} L ${f(xAt(line, bottom))},${f(bottom)}`;
  for (let i = line.length - 1; i >= 0; i--) {
    const [x, y] = line[i];
    if (y > first[1] && y < bottom) clip += ` L ${f(x)},${f(y)}`;
  }
  return { left, top, width, height, clip: `${clip} Z`, bodyTop: head.top + LINE_Y + WAVE_AMP + INK };
}

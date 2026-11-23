'use client';

import { isValidElement, MouseEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { INK } from '@/lib/design/strokes';
import { cellRegion, closedPath, gridColumns, gridPad, gridSeams, openPath, type GridBox } from '@/lib/design/segmentGrid';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import styles from './SegmentedGrid.module.css';

export interface GridSegment {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  /** The wash a hover grows inside it. */
  hoverOverlay?: string;
  /** Whether it is the chosen option (aria-pressed): the chosen face and the deep ink (the CSS). Its icon draws in `currentColor`. */
  pressed?: boolean;
  onClick?: () => void;
}

export interface SegmentedGridProps {
  segments: GridSegment[];
  seed?: number;
  /** The track under every cell that isn't chosen. */
  fill?: string;
  /** The chosen cell's face. */
  chosenFill?: string;
  /** The seams: a cut in the paper. */
  divider?: string;
  ariaLabelledBy?: string;
}

/** A cell's own width: its padding, its glyph, the gap and its whole words (read at their own width, never cut). */
function cellNatural(cell: HTMLElement, icon: number): number {
  const cs = getComputedStyle(cell);
  const px = (v: string) => parseFloat(v) || 0;
  const label = cell.querySelector<HTMLElement>('[data-label]');
  const words = label ? label.scrollWidth : 0;
  const gap = icon > 0 ? px(cs.columnGap) : 0;
  return px(cs.paddingLeft) + px(cs.paddingRight) + icon + gap + words + 1;
}

/**
 * A segmented choice as one fused grid (lib/design/segmentGrid): the bar's track, its seams cut in the paper, the
 * chosen cell in its own face — one row while every glyph beside its whole words fits an equal share of the room,
 * else two to a row, else one. Its cells are buttons, so like the bar it is a filled shape with no pen line. Until
 * it is measured (the server's HTML) the CSS lays it one row wide over 720 and 2×2 under.
 */
export function SegmentedGrid({
  segments,
  seed = 71,
  fill = 'var(--button-tonal)',
  chosenFill = 'var(--button-tonal)',
  divider = 'var(--color-cream)',
  ariaLabelledBy,
}: SegmentedGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [cols, setCols] = useState<number | null>(null);
  const [{ w, h }, setDims] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const maskId = useId().replace(/:/g, '');
  const specs = useRef(segments);
  specs.current = segments;

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const naturals = cellRefs.current.map((el, i) => {
      const icon = specs.current[i]?.icon;
      const box = isValidElement<{ size?: number }>(icon) ? (icon.props.size ?? 16) : icon ? 16 : 0;
      return el ? cellNatural(el, box) : 0;
    });
    const next = gridColumns(grid.clientWidth, naturals);
    setCols((cur) => (cur === next ? cur : next));
    setDims((cur) => (cur.w === grid.offsetWidth && cur.h === grid.offsetHeight ? cur : { w: grid.offsetWidth, h: grid.offsetHeight }));
  }, []);

  useLayoutEffect(() => measure(), [measure, segments, cols]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [measure, segments.length]);

  // CJK metrics shift once the webfonts settle.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    document.fonts.ready.then(measure).catch(() => {});
  }, [measure]);

  const shownCols = cols ?? 0;
  const rows = shownCols > 0 ? Math.ceil(segments.length / shownCols) : 0;
  const box: GridBox | null =
    w > 0 && h > 0 && shownCols > 0 ? { w, h, cols: shownCols, rows, seed, pad: gridPad(h / rows) } : null;

  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    const rowH = rows > 0 ? h / rows : h;
    return wobRect(w, h, 16, seed, Math.min(w, rowH) * 0.05, {
      segmentsH: [7, 9],
      segmentsV: rows > 1 ? [2 * rows, 3 * rows] : [2, 3],
      curve: 1.2,
      cornerJitter: 1.2,
      cornerOffset: rowH * 0.04,
    });
  }, [w, h, rows, seed]);

  const regions = useMemo(
    () => (box ? segments.map((_, i) => closedPath(cellRegion(Math.floor(i / box.cols), i % box.cols, box))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box?.w, box?.h, box?.cols, box?.rows, seed, segments.length],
  );
  const seams = useMemo(
    () => (box ? gridSeams(box).map(openPath) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box?.w, box?.h, box?.cols, box?.rows, seed],
  );

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hoverMaxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 4;
  const clipId = `sgrid-clip-${maskId}`;

  return (
    <div
      ref={gridRef}
      className={styles.grid}
      role="group"
      aria-labelledby={ariaLabelledBy}
      data-cols={cols ?? undefined}
    >
      {box && (
        <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.backdrop}>
          <defs>
            <clipPath id={clipId}>
              <path d={outerPath} />
            </clipPath>
            {segments.map((s, i) => (
              <mask key={s.key} id={`${clipId}-hover-${i}`} maskUnits="userSpaceOnUse" x={-w} y={-h} width={w * 3} height={h * 3}>
                {/* colour-fixed: a mask's luminance, not a colour anyone sees */}
                <circle cx={pos.x} cy={pos.y} r={hovered === i ? hoverMaxR : 0} fill="white" style={{ transition: 'r 340ms linear' }} />
              </mask>
            ))}
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path d={outerPath} fill={fill} />
            {segments.map((s, i) =>
              s.pressed && regions[i] ? <path key={s.key} d={regions[i]} fill={chosenFill} /> : null,
            )}
            {segments.map((s, i) =>
              regions[i] ? (
                <g key={s.key} mask={`url(#${clipId}-hover-${i})`}>
                  <path d={regions[i]} fill={s.hoverOverlay ?? 'color-mix(in oklch, var(--color-terracotta) 13%, transparent)'} />
                </g>
              ) : null,
            )}
            {seams.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={divider} strokeWidth={INK} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </g>
        </svg>
      )}
      <ShapeGrain w={w} h={h} d={outerPath} seed={seed} opacity={0.38} frequency={1.1} />
      {segments.map((s, i) => (
        <button
          key={s.key}
          ref={(el) => {
            cellRefs.current[i] = el;
          }}
          type="button"
          className={styles.cell}
          data-segment={s.key}
          aria-pressed={s.pressed}
          onClick={s.onClick}
          onMouseEnter={(e) => {
            recordPointer(e);
            setHovered(i);
          }}
          onMouseMove={recordPointer}
          onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
          onFocus={(e) => {
            const el = e.currentTarget;
            setPos({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
            setHovered(i);
          }}
          onBlur={() => setHovered((cur) => (cur === i ? null : cur))}
        >
          {s.icon}
          <span data-label className={styles.label}>
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );
}

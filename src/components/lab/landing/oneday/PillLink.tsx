'use client';

import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { Link } from '@/i18n/navigation';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './oneday.module.css';

/**
 * OrganicButton's faces as a link (a button inside a link is two tab stops and invalid HTML) or as a toggle: the
 * same wobbly pill, grain and hover brush — a fill, never an outline.
 */
const FACES = {
  solid: { fill: 'var(--button-fill)', text: 'var(--color-cream)', wash: 'color-mix(in oklch, var(--toward-ink) 14%, transparent)', seed: 3 },
  tonal: { fill: 'var(--button-tonal)', text: 'var(--button-on-tonal)', wash: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)', seed: 601 },
  /** The night band's: its paper a step lighter than the sky, cream words (colour-fixed there). */
  night: { fill: 'var(--night-pill)', text: 'var(--night-ink)', wash: 'color-mix(in oklch, var(--night-ink) 12%, transparent)', seed: 401 },
} as const;

export type PillFace = keyof typeof FACES;

const SEG_H: [number, number] = [2, 3];

interface PillProps {
  children: ReactNode;
  face?: PillFace;
  size?: 'md' | 'sm';
  className?: string;
}

function usePillFace(face: PillFace) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref);
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const v = FACES[face];
  const R = 16;
  const mag = Math.min(w, h) * 0.04;
  const off = Math.min(w, h) * 0.03;
  const d = useMemo(
    () => (w && h ? wobRect(w, h, R, v.seed, mag, { segmentsH: SEG_H, segmentsV: 1, curve: 1.3, cornerJitter: 1.3, cornerOffset: off }) : ''),
    [w, h, v.seed, mag, off],
  );
  const track = (e: MouseEvent<HTMLElement>, next: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    setOn(next);
  };
  const face_ = (
    <>
      <HandDrawnBorder w={w} h={h} R={R} seed={v.seed} mag={mag} fillColor={v.fill} strokeColor="transparent" strokeWidth={0}
        segmentsH={SEG_H} segmentsV={1} curve={1.3} cornerJitter={1.3} cornerOffset={off} />
      <ShapeGrain w={w} h={h} d={d} seed={v.seed} opacity={0.38} frequency={1.1} />
      <BrushWash w={w} h={h} d={d} color={v.wash} x={pos.x} y={pos.y} on={on} duration={340} overshoot={4} />
    </>
  );
  const props = {
    'data-face': face,
    'data-shape-pending': w && h ? undefined : '',
    style: { color: v.text, '--shape-fill': v.fill, '--shape-radius': `${R}px` } as CSSProperties,
    onMouseEnter: (e: MouseEvent<HTMLElement>) => track(e, true),
    onMouseLeave: (e: MouseEvent<HTMLElement>) => track(e, false),
  };
  return { ref, face: face_, props };
}

export function PillLink({ href, children, face = 'solid', size = 'md', className, dataWrite }: PillProps & { href: string; dataWrite?: boolean }) {
  const { ref, face: drawn, props } = usePillFace(face);
  return (
    <Link
      ref={ref as Ref<HTMLAnchorElement>}
      href={href}
      className={`${styles.pill} res-shape-stand-in ${className ?? ''}`}
      data-size={size}
      data-write={dataWrite ? '' : undefined}
      {...props}
    >
      {drawn}
      <span className={styles.pillLabel}>{children}</span>
    </Link>
  );
}

export function PillButton({ children, face = 'tonal', size = 'sm', className, onClick, pressed, disabled }: PillProps & { onClick: () => void; pressed?: boolean; disabled?: boolean }) {
  const { ref, face: drawn, props } = usePillFace(face);
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={`${styles.pill} res-shape-stand-in ${className ?? ''}`}
      data-size={size}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {drawn}
      <span className={styles.pillLabel}>{children}</span>
    </button>
  );
}

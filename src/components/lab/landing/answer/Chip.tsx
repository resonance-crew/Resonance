'use client';

import { useRef } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import s from './desk.module.css';

/** A tonal pill drawn by hand that does something on the page (inserts words, picks a story) — never submits a form. */
export function Chip({ children, onClick, label, seed, className }: { children: string; onClick: () => void; label?: string; seed: number; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <button
      ref={ref}
      type="button"
      className={[s.chip, 'res-shape-stand-in', className].filter(Boolean).join(' ')}
      data-shape-pending={w && h ? undefined : ''}
      aria-label={label}
      onClick={onClick}
    >
      <HandDrawnBorder w={w} h={h} R={14} seed={seed} fillColor="var(--button-tonal)" strokeColor="transparent" strokeWidth={0} segmentsH={[2, 3]} segmentsV={1} curve={1.2} />
      <span className={s.chipText}>{children}</span>
    </button>
  );
}

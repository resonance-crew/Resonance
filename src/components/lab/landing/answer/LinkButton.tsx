'use client';

import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import btn from '@/components/atoms/OrganicButton/OrganicButton.module.css';
import { Link } from '@/i18n/navigation';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import s from './answer.module.css';

/**
 * A link that wears OrganicButton's face (a copy of its solid / tonal faces, the same seeds and wobble): the link
 * itself is the pill, so there is one tab stop and no button inside an anchor.
 */
const FACES = {
  solid: { fill: 'var(--button-fill)', text: 'var(--color-cream)', wash: 'color-mix(in oklch, var(--toward-ink) 14%, transparent)', seed: 3 },
  tonal: { fill: 'var(--button-tonal)', text: 'var(--button-on-tonal)', wash: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)', seed: 601 },
} as const;

const SEG_H: [number, number] = [2, 3];
const R = 16;

export function LinkButton({ href, variant = 'solid', children, className }: { href: string; variant?: keyof typeof FACES; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { w, h } = useElementSize(ref, 160, 50);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const f = FACES[variant];
  const mag = Math.min(w, h) * 0.04;
  const corner = Math.min(w, h) * 0.03;
  const d = useMemo(
    () => (w && h ? wobRect(w, h, R, f.seed, mag, { segmentsH: SEG_H, segmentsV: 1, curve: 1.3, cornerJitter: 1.3, cornerOffset: corner }) : ''),
    [w, h, f.seed, mag, corner],
  );
  const at = (e: MouseEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <Link
      ref={ref}
      href={href}
      className={[btn.btn, s.linkButton, 'res-shape-stand-in', className].filter(Boolean).join(' ')}
      style={{ color: f.text, '--shape-fill': f.fill, '--shape-radius': `${R}px` } as CSSProperties}
      data-variant={variant}
      data-shape-pending={w && h ? undefined : ''}
      onMouseEnter={(e) => {
        at(e);
        setHovered(true);
      }}
      onMouseLeave={(e) => {
        at(e);
        setHovered(false);
      }}
    >
      <HandDrawnBorder w={w} h={h} R={R} seed={f.seed} mag={mag} fillColor={f.fill} strokeColor="transparent" strokeWidth={0} segmentsH={SEG_H} segmentsV={1} curve={1.3} cornerJitter={1.3} cornerOffset={corner} />
      <ShapeGrain w={w} h={h} d={d} seed={f.seed} opacity={0.38} frequency={1.1} />
      <BrushWash w={w} h={h} d={d} color={f.wash} x={pos.x} y={pos.y} on={hovered} duration={340} overshoot={4} />
      <span className={btn.label}>{children}</span>
    </Link>
  );
}

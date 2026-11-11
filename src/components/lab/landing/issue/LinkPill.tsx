'use client';

import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { Link } from '@/i18n/navigation';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import btn from '@/components/atoms/OrganicButton/OrganicButton.module.css';

/**
 * A link that wears OrganicButton's face (solid or tonal, the same pill, grain and hover ink) — one element, one tab
 * stop, where `Link > OrganicButton` nests a button in a link (two). A copy for the issue only: OrganicButton itself
 * is always a <button>.
 */
const FACES = {
  solid: { fill: 'var(--button-fill)', text: 'var(--color-cream)', wash: 'color-mix(in oklch, var(--toward-ink) 14%, transparent)', seed: 3 },
  tonal: { fill: 'var(--button-tonal)', text: 'var(--button-on-tonal)', wash: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)', seed: 5 },
} as const;
const SEG_H: [number, number] = [2, 3];
const R = 16;

export function LinkPill({
  href,
  variant,
  children,
  className,
  linkRef,
}: {
  href: string;
  variant: keyof typeof FACES;
  children: ReactNode;
  className?: string;
  linkRef?: Ref<HTMLAnchorElement>;
}) {
  const face = FACES[variant];
  const box = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(box, 160, 50);
  const [hover, setHover] = useState<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const mag = Math.min(w, h) * 0.04;
  const corner = Math.min(w, h) * 0.03;
  const d = useMemo(
    () => (w && h ? wobRect(w, h, R, face.seed, mag, { segmentsH: SEG_H, segmentsV: 1, curve: 1.3, cornerJitter: 1.3, cornerOffset: corner }) : ''),
    [w, h, face.seed, mag, corner],
  );
  const at = (e: React.MouseEvent, on: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, on });
  };
  return (
    <Link
      ref={linkRef}
      href={href}
      className={[btn.btn, 'res-shape-stand-in', className].filter(Boolean).join(' ')}
      style={{ color: face.text, textDecoration: 'none', '--shape-fill': face.fill, '--shape-radius': `${R}px` } as React.CSSProperties}
      data-variant={variant}
      data-shape-pending={w > 0 && h > 0 ? undefined : ''}
      onMouseEnter={(e) => at(e, true)}
      onMouseLeave={(e) => at(e, false)}
    >
      <span ref={box} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <HandDrawnBorder w={w} h={h} R={R} seed={face.seed} mag={mag} fillColor={face.fill} strokeColor="transparent" strokeWidth={0} segmentsH={SEG_H} segmentsV={1} curve={1.3} cornerJitter={1.3} cornerOffset={corner} />
        <ShapeGrain w={w} h={h} d={d} seed={face.seed} opacity={0.38} frequency={1.1} />
        <BrushWash w={w} h={h} d={d} color={face.wash} x={hover.x} y={hover.y} on={hover.on} duration={340} overshoot={4} />
      </span>
      <span className={btn.label}>{children}</span>
    </Link>
  );
}

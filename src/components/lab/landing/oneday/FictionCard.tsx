'use client';

import type { CSSProperties } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { cardVar } from '@/lib/design/cardColours';
import { Paper } from './Paper';
import styles from './oneday.module.css';

/**
 * A story card as a picture, not a record: the family's paper and pen, a title stroke, a few lines of a hand's
 * scribble and a byline dot — nobody's real story, nobody's name. `blank`: the card not written yet (a dashed
 * outline; its lines draw in when its scene says so, `data-written` on an ancestor). Decoration: aria-hidden.
 */
export function FictionCard({
  family,
  seed,
  lines = 5,
  blank,
  className,
  style,
  outline,
}: {
  family: number;
  seed: number;
  lines?: number;
  blank?: boolean;
  className?: string;
  style?: CSSProperties;
  outline?: string;
}) {
  const W = 200;
  const rows = Array.from({ length: lines }, (_, i) => ({
    y: 92 + i * 22,
    w: i === lines - 1 ? 96 : 160 - ((i * 23 + seed) % 3) * 12,
    d: wavyLine(i === lines - 1 ? 96 : 160 - ((i * 23 + seed) % 3) * 12, seed * 7 + i * 13, 1.8, 7),
  }));
  return (
    <Paper
      seed={seed}
      fill={blank ? 'var(--color-card-bg)' : cardVar('interior', family)}
      pen={blank ? 'var(--soft-pen)' : cardVar('border', family)}
      penWidth={INK}
      dashed={blank}
      radius={18}
      grain={0.18}
      className={`${styles.fiction} ${className ?? ''}`}
      style={style}
      outline={outline}
    >
      <svg className={styles.fictionInk} viewBox={`0 0 ${W} 250`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-blank={blank ? '' : undefined}>
        {/* the title: a thicker stroke, the family's pen */}
        <rect
          className={styles.fictionTitle}
          x={22}
          y={36}
          width={118 - (seed % 4) * 9}
          height={11}
          rx={5.5}
          fill={blank ? 'var(--color-text-muted)' : cardVar('border-deep', family)}
          opacity={blank ? 0.35 : 0.85}
        />
        {/* the prose: a hand's scribble */}
        {rows.map((r, i) => (
          <path
            key={i}
            className={styles.fictionLine}
            style={{ '--i': i } as CSSProperties}
            d={r.d}
            transform={`translate(22 ${r.y})`}
            fill="none"
            stroke={blank ? 'var(--color-text-muted)' : cardVar('note-ink', family)}
            strokeWidth={INK}
            strokeLinecap="round"
            opacity={0.75}
           
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* the byline: a dot and a short stroke */}
        <circle cx={30} cy={224} r={7.5} fill={blank ? 'none' : cardVar('accent', family)} stroke={blank ? 'var(--color-text-muted)' : cardVar('border', family)} strokeWidth={INK_LIGHT} className={styles.fictionDot} />
        <path className={styles.fictionLine} style={{ '--i': lines } as CSSProperties} d={wavyLine(54, seed + 99, 1.2, 4)} transform="translate(46 224)" fill="none"
          stroke={blank ? 'var(--color-text-muted)' : cardVar('note-ink', family)} strokeWidth={INK_LIGHT} strokeLinecap="round" opacity={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
    </Paper>
  );
}

/** The logo's three waves, drawn as the link between two cards (`data-drawn` on an ancestor draws them in). */
export function LinkWaves({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`${styles.waves} ${className ?? ''}`} style={style} viewBox="0 0 24 14" preserveAspectRatio="none" aria-hidden="true">
      {['M1,4.2 C3.4,1.6 5.6,1.5 7.8,4 C10,6.5 12.2,6.6 14.4,4.1 C16.6,1.7 18.8,1.6 23,4.1',
        'M1,8.1 C3.4,5.5 5.6,5.6 7.8,8 C10,10.4 12.2,10.5 14.4,8.1 C16.6,5.7 18.8,5.6 23,8',
        'M1,12 C3.4,9.4 5.6,9.3 7.8,11.8 C10,14.2 12.2,14.3 14.4,11.9 C16.6,9.6 18.8,9.5 23,11.9'].map((d, i) => (
        <path key={i} d={d} style={{ '--i': i } as CSSProperties} fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG}
          strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/**
 * The ≋ between a story and its answer (SPEC §5.3 reply): the platform's own resonance glyph — the 'wave' icon's three
 * even waves (atoms/Icon/icons/wave.tsx), the one the card page's 共振 and the publish step show — in the film's chrome
 * ink, at the brand mark's pen (INK in the icon's 24-unit box, so it reads as the icon does at any size). Level in every
 * layout. The director draws it in through `--draw` (0 → 1): the three waves one after another, each from its start.
 * `width` is the box's (the glyph is 9/10 of it); over the stage the slot's CSS sizes it per layout.
 */
import type { CSSProperties } from 'react';
import { WAVE_PATHS } from '@/components/atoms/Icon/icons/wave';
import { INK } from '@/lib/design/strokes';
import styles from './film.module.css';

/** The glyph's box in the icon's units: its waves (x 3…20.9, y 5.8…18.2) and their pen, centred on (12, 12). */
const BOX = { x: 2, y: 4.5, w: 20, h: 15 } as const;
/** Each wave's share of the draw-in and the step between their starts (the last ends as `--draw` reaches 1). */
const SHARE = 0.5;
const STEP = (1 - SHARE) / (WAVE_PATHS.length - 1);

export function PairWave({ width = 53 }: { width?: number }) {
  return (
    <svg
      className={styles.pairWave}
      viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`}
      width={width}
      height={(width * BOX.h) / BOX.w}
      fill="none"
      stroke="var(--film-chrome-ink)"
      // the brand mark's pen; the director thins it as it scales the mark up (`--pen`), so it never outweighs the pair's
      style={{ strokeWidth: `calc(${INK}px * var(--pen, 1))` }}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {WAVE_PATHS.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          // a gap a hair longer than the path, so an undrawn wave shows nothing (not even its round cap)
          style={{ strokeDasharray: '1 1.01', strokeDashoffset: `calc(1 - clamp(0, (var(--draw, 1) - ${(i * STEP).toFixed(2)}) / ${SHARE}, 1))` } as CSSProperties}
        />
      ))}
    </svg>
  );
}

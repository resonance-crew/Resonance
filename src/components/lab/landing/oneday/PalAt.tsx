import type { CSSProperties } from 'react';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import type { Still } from '@/lib/mascots/pals/still';
import styles from './oneday.module.css';

/**
 * A Paper Pal standing still where the server draws it (its feet on the line its parent's CSS puts at the bottom),
 * until its stage brings it on there (`live`): then the still gives way. Decoration: the words beside it say it.
 */
export function PalAt({
  still,
  live,
  className,
  style,
  waveArm,
  eyes,
  phase = 0,
  managed,
}: {
  still: Still;
  live?: boolean;
  className?: string;
  style?: CSSProperties;
  waveArm?: 'l' | 'r';
  eyes?: 'open' | 'sleepy';
  phase?: number;
  /** A stage brings this one on (its still waits unseen while one is coming). */
  managed?: boolean;
}) {
  return (
    <span className={`${styles.still} ${className ?? ''}`} style={style} data-still={still.slug} data-live={live ? '' : undefined} data-managed={managed ? '' : undefined} aria-hidden="true">
      <PaperPalStill still={still} waveArm={waveArm} eyes={eyes} phase={phase} />
    </span>
  );
}

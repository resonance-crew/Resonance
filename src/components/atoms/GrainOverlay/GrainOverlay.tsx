'use client';

import { useId } from 'react';
import styles from './GrainOverlay.module.css';

export interface GrainOverlayProps {
  opacity?: number;
  extendTop?: number;
  extendBottom?: number;
  /**
   * The grain as a still bitmap (a noise tile through a mask) instead of a live feTurbulence: for a surface repeated
   * down a scrolling list (the story cards), which WebKit would run the filter for again on every tile it rasters.
   * Its mean darkening is the filter's; a surface matched to the live noise elsewhere (AuthCard's strips) keeps it.
   */
  still?: boolean;
}

/**
 * Paper grain over a surface: the scheme's grain ink (--grain-ink: black specks
 * on light paper, light ones on night paper) whose alpha follows fractal noise.
 *
 * The overlay shifts what lies beneath by `opacity` on average (the tone the
 * cards were tuned against) — times the scheme's --grain-scale, since light
 * specks on a dark paper read louder — and the noise spreads it unevenly from
 * pixel to pixel so it reads as grain rather than a flat tint.
 */
export function GrainOverlay({ opacity = 0.06, extendTop = 0, extendBottom = 0, still = false }: GrainOverlayProps) {
  const id = useId().replace(/:/g, '');
  if (still) {
    return (
      <span
        aria-hidden="true"
        data-grain="still"
        className={styles.still}
        style={{
          top: -extendTop,
          bottom: -extendBottom,
          opacity: `calc(${Math.min(1, opacity * 2)} * var(--grain-scale, 1))`,
        }}
      />
    );
  }
  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: -extendTop,
        bottom: -extendBottom,
        width: '100%',
        height: `calc(100% + ${extendTop + extendBottom}px)`,
        pointerEvents: 'none',
        // The noise alpha below averages ½, so double it to keep `opacity`
        // as the mean darkening.
        opacity: `calc(${Math.min(1, opacity * 2)} * var(--grain-scale, 1))`,
        zIndex: 10,
      }}
      aria-hidden="true"
    >
      <defs>
        <filter id={`grain-${id}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves={4} stitchTiles="stitch" />
          {/* Alpha = 1 − luminance of the noise: denser specks where the
              noise is dark, fainter where it is bright… */}
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1"
            result="specks"
          />
          {/* …in the grain's ink. */}
          <feFlood style={{ floodColor: 'var(--grain-ink)' }} />
          <feComposite in2="specks" operator="in" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
    </svg>
  );
}

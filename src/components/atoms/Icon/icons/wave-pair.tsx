import type { IconRenderProps } from '../types';

/**
 * Two waves in phase (round 26, S4): two people on one frequency — the 共振 tap once it is on (the resting
 * glyph is `wave`, three ripples spreading). Never a heart, never a tick: it says "we felt the same", not "liked".
 */
export const WAVE_PAIR_PATHS = [
  'M3.2,9.4 C5.2,7.1 7.2,7.2 9.1,9.4 C11.0,11.6 13.0,11.7 14.9,9.5 C16.8,7.3 18.8,7.2 20.8,9.4',
  'M3.3,14.7 C5.3,12.4 7.2,12.5 9.2,14.7 C11.1,16.9 13.1,17.0 15.0,14.8 C16.9,12.6 18.9,12.5 20.8,14.7',
] as const;

export function WavePairIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {WAVE_PAIR_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

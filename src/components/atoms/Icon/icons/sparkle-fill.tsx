import type { IconRenderProps } from '../types';

// The selected 共振場 tab: the sparkle's solid twin — the star and its two
// sparks filled in, each still ringed by its own pen line so the outline
// keeps the hand's weight (round 16 §2).
export function SparkleFillIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
  const star =
    'M12.4,3.5 C12.9,7.0 12.0,10.2 13.6,11.7 C15.2,13.1 18.6,12.4 20.4,12.6 C17.0,13.4 14.6,12.5 13.3,14.0 C11.9,15.6 12.7,18.7 12.2,20.6 C11.5,17.4 12.0,14.2 10.6,12.9 C9.0,11.5 5.7,12.4 3.6,12.0 C7.0,11.4 10.2,12.0 11.4,10.5 C12.7,8.8 11.6,5.4 12.4,3.5 Z';
  const spark = 'M18.4,5.4 C18.7,6.3 18.4,6.9 19.4,7.0 C18.5,7.2 18.8,7.9 18.4,8.5 C18.2,7.7 17.4,7.4 16.8,7.1 C17.6,6.9 18.2,6.3 18.4,5.4 Z';
  const fleck = 'M5.5,17.2 C5.8,17.8 5.7,18.4 6.4,18.5 C5.8,18.7 5.8,19.3 5.5,19.8 C5.3,19.1 4.8,18.9 4.3,18.5 C4.8,18.4 5.2,17.9 5.5,17.2 Z';
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
      {[star, spark, fleck].map((d) => (
        <path key={`f${d.slice(0, 8)}`} d={d} fill={color} stroke="none" />
      ))}
      {[star, spark, fleck].map((d) => (
        <path key={`s${d.slice(0, 8)}`} d={d} />
      ))}
    </svg>
  );
}

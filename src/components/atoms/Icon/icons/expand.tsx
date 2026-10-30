import type { IconRenderProps } from '../types';

// "Expand" (放大) — two short arrows flying apart toward opposite corners,
// each a bowed shaft and a one-stroke head (arrow-up's hand).
export function ExpandIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      {/* up and out, to the top right */}
      <path d="M13.5,10.5 C15.0,9.0 16.6,7.4 18.3,5.8" />
      <path d="M13.9,5.6 C15.4,5.5 16.9,5.5 18.4,5.6 C18.6,7.1 18.6,8.6 18.4,10.0" />
      {/* down and out, to the bottom left */}
      <path d="M10.4,13.6 C8.9,15.1 7.4,16.6 5.7,18.2" />
      <path d="M5.5,13.9 C5.4,15.4 5.4,16.9 5.6,18.4 C7.1,18.6 8.6,18.6 10.1,18.4" />
    </svg>
  );
}

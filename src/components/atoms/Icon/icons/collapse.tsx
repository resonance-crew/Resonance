import type { IconRenderProps } from '../types';

// "Collapse" (縮小) — expand's two arrows turned round: each flies in from
// its corner toward the middle, its head where they nearly meet.
export function CollapseIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      {/* in from the top right */}
      <path d="M18.5,5.5 C17.0,7.0 15.5,8.5 13.9,10.1" />
      <path d="M13.8,5.9 C13.7,7.4 13.7,8.8 13.9,10.2 C15.4,10.3 16.8,10.3 18.2,10.1" />
      {/* in from the bottom left */}
      <path d="M5.5,18.5 C7.0,17.0 8.5,15.5 10.1,13.9" />
      <path d="M5.9,13.8 C7.4,13.7 8.8,13.7 10.2,13.9 C10.3,15.4 10.3,16.8 10.1,18.2" />
    </svg>
  );
}

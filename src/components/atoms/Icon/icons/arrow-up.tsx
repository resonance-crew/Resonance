import type { IconRenderProps } from '../types';

// arrow-right turned to point up: the same bowed shaft and one-stroke head,
// so the two read as one hand.
export function ArrowUpIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M11.8,20.1 C13.7,15.8 10.2,9.2 12.3,4.8" />
      <path d="M6.2,11.1 C8.0,8.6 10.4,6.2 12.2,4.8 C13.5,5.8 15.1,7.3 17.7,11.0" />
    </svg>
  );
}

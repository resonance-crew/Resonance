import type { IconRenderProps } from '../types';

// A domino mask (anonymous): one wobbly band dipping at the bridge of the
// nose, two almond eyes a little uneven.
export function MaskIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M2.8,9.6 C5.2,7.6 9.2,7.9 12.0,9.6 C14.9,7.9 18.9,7.6 21.2,9.7 C21.7,12.8 20.3,16.1 17.2,16.3 C15.0,16.4 13.5,14.9 12.0,13.6 C10.5,14.9 8.9,16.4 6.8,16.2 C3.7,16.0 2.3,12.7 2.8,9.6 Z" />
      <path d="M5.7,11.9 C6.6,10.8 8.6,10.7 9.6,11.9 C8.6,13.1 6.7,13.2 5.7,11.9 Z" />
      <path d="M14.4,11.9 C15.4,10.7 17.4,10.8 18.3,11.9 C17.3,13.2 15.4,13.1 14.4,11.9 Z" />
    </svg>
  );
}

import type { IconRenderProps } from '../types';

// "Restore" (還原, 復原): a loop drawn back on itself — an open circle running
// round from the lower left, over the top and back down, its end coming home
// at the left in the bowed flick head the reply and arrow glyphs share,
// pointing down: turning time back.
export function RestoreIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M5.1,11.6 C5.3,7.9 8.4,5.0 12.2,5.1 C16.1,5.2 19.1,8.3 19.0,12.2 C18.9,16.0 15.8,19.1 12.0,19.0 C10.1,19.0 8.4,18.2 7.2,16.9" />
      <path d="M2.8,9.3 C3.6,10.1 4.4,11.0 5.1,11.9 C5.9,11.1 6.7,10.4 7.7,9.8" />
    </svg>
  );
}

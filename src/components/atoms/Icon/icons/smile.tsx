import type { IconRenderProps } from '../types';

// "React" (回應) — a smiling face drawn in one pen: a lopsided loop, a little
// fuller on the left, whose line runs on past where it began; two short
// strokes for eyes, the right one a touch higher; a smile that lifts more at
// its right end, as a hand draws it.
export function SmileIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      {/* face: an uneven loop around (12,12), its pen running on past the start */}
      <path d="M10.9,4.2 C15.3,3.6 19.6,6.6 19.8,11.6 C20.0,16.3 16.6,19.9 12.1,19.9 C7.7,19.9 4.1,16.6 4.2,12.0 C4.3,7.9 7.3,4.6 11.4,4.3 C12.6,4.2 13.7,4.4 14.6,4.8" />
      {/* eyes */}
      <path d="M9.2,9.6 C9.2,10.1 9.2,10.6 9.3,11.1" />
      <path d="M14.8,9.3 C14.8,9.8 14.9,10.3 14.9,10.8" />
      {/* smile, lifting more at its right end */}
      <path d="M8.3,14.0 C9.4,15.8 11.3,16.5 13.2,16.1 C14.3,15.8 15.2,15.1 15.9,13.7" />
    </svg>
  );
}

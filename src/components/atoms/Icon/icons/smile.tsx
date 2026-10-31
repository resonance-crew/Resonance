import type { IconRenderProps } from '../types';

// "React" (回應) — a smiling face drawn in one pen: a lopsided loop, a little
// fuller on the left, whose line runs on past where it began; two dabs for
// eyes, the right one a touch higher; a smile that lifts more at its right end
// and flicks off, as a hand draws it.
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
      <path d="M11.2,4.0 C15.6,3.5 20.1,6.9 19.9,11.9 C19.7,16.6 16.1,20.2 11.7,20.0 C7.4,19.8 3.9,16.4 4.1,11.8 C4.3,7.6 7.2,4.5 11.3,4.2 C12.8,4.1 14.1,4.5 15.1,5.2" />
      {/* eyes: two dabs, the right one a touch higher */}
      <path d="M9.0,10.0 L9.1,10.7" />
      <path d="M14.7,9.8 L14.8,10.5" />
      {/* smile, lifting more at its right end, the pen flicking off */}
      <path d="M8.1,13.8 C9.2,15.9 11.4,16.8 13.5,16.2 C14.6,15.9 15.5,15.1 16.0,13.9 C16.1,13.6 16.3,13.4 16.6,13.4" />
    </svg>
  );
}

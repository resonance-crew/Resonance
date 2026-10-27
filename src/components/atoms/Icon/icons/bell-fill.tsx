import type { IconRenderProps } from '../types';

// The selected 通知 tab: the bell's solid twin — the dome filled down to its
// rim, a small shine on its shoulder knocked out of it (an even-odd hole),
// the rim, the clapper and the knob drawn as on the outline bell.
export function BellFillIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* the dome, closed along its rim, with the shine as a hole */}
      <path
        d="M5.3,17.0 C4.9,12.6 6.1,9.3 7.5,7.3 C9.1,4.6 11.0,4.0 12.2,4.1 C13.7,4.2 15.7,5.3 16.9,8.0 C17.9,10.2 18.6,13.1 18.6,17.1 C17.1,17.6 15.2,17.9 13.4,18.0 C11.1,18.2 8.1,18.3 5.3,17.0 Z M8.6,9.6 C9.0,8.4 9.7,7.5 10.6,7.0 C10.9,6.85 11.2,7.4 10.95,7.6 C10.2,8.1 9.7,8.9 9.4,9.9 C9.3,10.25 8.5,10.0 8.6,9.6 Z"
        fill={color}
        fillRule="evenodd"
        stroke="none"
      />
      <path d="M5.3,17.0 C4.9,12.6 6.1,9.3 7.5,7.3 C9.1,4.6 11.0,4.0 12.2,4.1 C13.7,4.2 15.7,5.3 16.9,8.0 C17.9,10.2 18.6,13.1 18.6,17.1" />
      <path d="M5.1,17.0 C8.1,18.3 11.1,18.2 13.4,18.0 C15.2,17.9 17.1,17.6 18.8,17.1" />
      <path d="M9.9,19.6 C10.9,21.1 13.3,21.0 14.2,19.3" />
      <path d="M11.4,3.2 C12.2,2.7 12.9,2.9 12.9,3.8 C12.9,4.5 12.1,4.7 11.5,4.4 C11.1,4.1 11.1,3.6 11.4,3.2 Z" fill={color} stroke="none" />
    </svg>
  );
}

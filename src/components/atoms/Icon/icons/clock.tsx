import type { IconRenderProps } from '../types';

// "Recent" (最近用過) — a clock face in one pen, a lopsided loop like the
// smile's whose line runs on past its start; two hands, the long one a
// little bowed, meeting a hair off centre.
export function ClockIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      {/* face */}
      <path d="M11.0,3.9 C15.6,3.5 20.0,6.7 20.1,11.8 C20.2,16.5 16.7,20.1 12.0,20.1 C7.5,20.1 3.9,16.7 4.0,12.0 C4.1,7.8 7.2,4.4 11.4,4.1 C12.5,4.0 13.6,4.3 14.5,4.7" />
      {/* hands */}
      <path d="M12.1,7.4 C12.0,9.0 12.0,10.6 12.1,12.1 C13.3,12.9 14.5,13.6 15.7,14.2" />
    </svg>
  );
}
